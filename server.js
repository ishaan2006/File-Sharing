// for now, everything assumes that client requests are valid and non-malicious
// TODO: change this ^^^^

// library abstractions
import nextUserFriendlyId               from "./user-friendly-id.js"
import {getHash, verifyHash}            from "./private/passwords.js"
import * as mongoOps                    from "./mongo-operations.js"
import { formatAsJSONHTML }             from "./format-json.js"
import shredFile                        from "./shred-file.js"

import express                          from "express"
import crypto                           from "crypto"
import multer                           from "multer"
import https                            from "https"
import { dirname, extname as _extname } from "path"
import http                             from "http"
import { fileURLToPath }                from "url"
import fs                               from "fs"


const
	__filename = fileURLToPath(import.meta.url),
	__dirname = dirname(__filename),

	upload = multer({
		limits: { fileSize: "1gb" } // pretty much any file
	}),
	app = express(),

	read = (location, encoding="utf-8") => fs.readFileSync(location, encoding),

	// openssl req -nodes -x509 -days 730 -newkey rsa:4096 -keyout server.key -out server.crt
	credentials = {
		key: read("./private/server.key"),
		cert: read("./server.crt"),
	},

	UPLOAD_DESTINATION = "private/uploads/",
	ALLOWED_METHODS = "GET,POST,OPTIONS",
	ROOT = __dirname + "/public/",
	HTTPS_PORT = 443,
	HTTP_PORT = 80,
	IP = "127.0.0.1",
	allowedOrigins = [
		`https://${IP}:${HTTPS_PORT}`, `https://localhost:${HTTPS_PORT}`,
		`http://${IP}:${HTTP_PORT}`, `http://localhost:${HTTP_PORT}`,
	],
	allowedGetAddressLocations = [
		// this only includes the ones with default routers
		"/index.html",
		"/upload.html",
		"/robots.txt",
		"/download.html",
		// maybe add docs.html?
	],
	allowedGetMiscellaneousLocations = [
		"/styles.css",
		"/favicon.ico",
		"/error-template.html",
		"/upload-results.html",
	],
	allowedGetLocations = allowedGetAddressLocations.concat(allowedGetMiscellaneousLocations
	),
	allowedGetLocationsString = `Allowed paths for GET: ${
		["/", "/download.html"].concat(allowedGetLocations).map(e => `'${e}'`).join(", ")
	}\n`


function extname(path) {
	// `path.extname(".dotfile")` returns "" for some reason
	// this fixes that issue

	return _extname("a" + path)
}

function applyTemplate(filename, object={}) {
	var htmlContent = read(filename)

	for (let [key, value] of Object.entries(object))

		htmlContent = htmlContent.replace(
			RegExp(`\\{${key}\\}`, "g"),
			value.toString()
		)

	return htmlContent
}


app.use(function cors(req, res, next) {
	res.setHeader("Access-Control-Allow-Origin",
		allowedOrigins.includes(req.headers.origin) ?
			req.headers.origin :
			allowedOrigins[0]
	)

	res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS)

	res.setHeader("Access-Control-Allow-Credentials", "true")

	next()
})

app.use(express.json({ limit: "1mb" }))

app.use(function utils(req, res, next) {
	req.port = req.connection.remotePort
	req.ipport = `${req.ip}:${req.port}`
	req.referrer = req.get("referrer") ?? "direct address"
	req.directAddress = req.referrer === "direct address"

	req.logRequest = function logRequest(
		returncode = 200,
		message = "",
		newline = true,
	) {
		if (typeof returncode === "object") {
			if (returncode.ret != null)
				res.status(returncode.ret)

			newline = returncode.lf ?? true
			message = returncode.msg ?? ""
			returncode = returncode.ret ?? 200
		}
		else if (arguments.length)
			res.status(returncode); // this semicolon is required

		(newline ? console.log : process.stdout.write)(`${req.ipport} requesting ${
			["HEAD", "OPTIONS"].includes(req.method) ? "the" : "to"
		} ${req.method} '${req.url}' over ${req.protocol} from ${req.referrer}; ${message}${
			message === "" ? "" : ", "
		}sending ${returncode}`)

		return this
	}

	res.failurePage = function failurePage(msg = "Invalid Request", linkHome = true) {
		try {
			return applyTemplate("./public/error-template.html", {
				method: req.method,
				location: req.url,
				message: msg,
				link: linkHome ? '<a href="/">return to homepage</a>' : ""
			})
		} catch {
			return msg ?? "Invalid Request"
		}
	}

	res.sendFailurePage = function sendFailurePage() {
		res.setHeader("Content-Type", "text/html")
		res.send( res.failurePage(...arguments) )

		return this
	}

	next()
})

app.post("/upload.html", upload.single("file"), async (req, res) => {

	if (!allowedOrigins.map(e => e + "/upload.html").concat(
		allowedOrigins.map(e => e.replace(/:\d+$/, "") + "/upload.html")
	).includes( req.referrer )) {
		req.logRequest(404)
		res.sendFailurePage("404 Not Found")

		return
	}

	const body = JSON.parse(req.body.json ?? null)
	const file = req.file
	const fileDigest = crypto.createHash("sha512").update(file.buffer).digest("hex")
	const originalExtension = extname(file.originalname)

	body.originalName = file.originalname
	body.url = "<unknown>" // TODO: change this once downloading is a thing
	body.destination = UPLOAD_DESTINATION + fileDigest + originalExtension + ".tmp"
	body.projectedDeleteTime = Date.now() + (body.deleteMins * 6e4 || 0)

	let exists = fs.existsSync(body.destination)
	body.action = exists ? "update" : "upload"

	res.setHeader("Content-Type", "text/html")

	// `file.buffer` is not defined in the multer.diskStorage() callbacks
	existsBlock: if (exists) {
		console.log("file already exists")
		const dbElement = await mongoOps.get(fileDigest, { decrementUses: false })

		if (dbElement == null) {
			console.log("file is present but the db element is not; It was probably deleted manually")
			// TODO: handle when the element is present but the file is not

			exists = false
			break existsBlock
		}

		dbElement[fileDigest].projectedDeleteTime = body.projectedDeleteTime
		dbElement[fileDigest].usesRemaining       = body.uses
		dbElement[fileDigest].originalName        = body.originalName
		dbElement[fileDigest].sensitive           = body.sensitive

		mongoOps.update(dbElement)
		// TODO: let the user know somehow that passwords can't be updated by re-uploading
	}

	// in case the `if exists` block changes `exists` to false
	if (!exists) {
		fs.writeFileSync(body.destination, file.buffer)

		body.userFriendlyId = body.includeFriendly ? await nextUserFriendlyId(body) : null

		mongoOps.add({
			[fileDigest]: {
				relativeFileLocation : body.destination,
				projectedDeleteTime  : body.projectedDeleteTime,
				userFriendlyId       : body.userFriendlyId,
				usesRemaining        : body.uses,
				passwordHash         : getHash(body.passwordHash),
				originalName         : body.originalName,
				sensitive            : body.sensitive,
				idFormat             : body.idFormat,
			}
		})

		console.log("body:", body)
	}

	req.logRequest(200)


	res.send(
		applyTemplate("./public/upload-results.html", {
			results: formatAsJSONHTML({
				json: body,
				file: {
					encoding: file.encoding,
					mimetype: file.mimetype,
					bytes: file.size,
				}
			})
				.replace(/&quot;(\w+)&quot;(?=:)/g, "$1")
				.replace(/&quot;&lt;(\w+)&gt;&quot;/g, "$1")
		})
	)
})

app.get(/^\/(home(\.html?)?|index)?$/, (req, res) => {
	req.logRequest(303, "use '/index.html'")

	res.redirect(303, "/index.html")
})

// simplify the requests
app.get(/^\/(upload|download|delete)\.htm$/, (req, res) => {
	// .htm -> .html

	req.logRequest(303, `use '${req.url + "l"}'`)

	res.redirect(303, req.url + "l")
})
app.get(/^\/(upload|download|delete)$/, (req, res) => {
	// extension -> .html

	req.logRequest(303, `use '${req.url + ".html"}'`)

	res.redirect(303, req.url + ".html")
})

app.get(/^\/download\.html\?type=(short-id|hash)&id=[A-Za-z\d]+$/, (req, res, next) => {
	console.log("query: %o", req.query)

	const queryKeys = Object.keys(req.query)

	if (req.referrer === "direct address")
		return next() // interpret the request as a normal url lookup

	const pass = req.headers["Authentication"].replace(/^Bearer /, "").toLowerCase()
	const id = req.query.id.toLowerCase()

	req.logRequest(501)

	res.setHeader("Content-Type", "text/html")
	res.send("<p>Not Implemented</p>")
	// TODO: get the file from the database

	// TODO: differentiate between a GET for the html, or a GET for a download (from the form).
})

for (let loc of allowedGetAddressLocations)
	app.get(loc, (req, res) => {
		req.logRequest(200)

		res.sendFile(loc, {root: ROOT})
	})

for (let loc of allowedGetMiscellaneousLocations)
	app.get(loc, (req, res) => {

		if (req.directAddress) {
			req.logRequest(403)
			res.sendFailurePage("403 Forbidden")

			return
		}

		req.logRequest(200)
		res.sendFile(loc, {root: ROOT})
	})


app.use((req, res, next) => {
	if (req.method === "GET" || req.method === "POST") {
		req.logRequest(404)
		res.sendFailurePage("404 Not Found")
	}
	else
		next()
})

app.options("*", (req, res) => {
	req.logRequest(200)

	res.setHeader("Allow", ALLOWED_METHODS)
	res.setHeader("Content-Type", "text/plain")

	res.send(allowedGetLocationsString)
})

app.all("*", (req, res) => {
	req.logRequest(405, "invalid method, closing connection")

	res.setHeader("Content-Type", "text/plain")
	res.setHeader("Connection", "close")

	res.status(405)

	res.send(`Invalid method: ${req.method}\nclosing connection\n`)
})

console.log("Routers created")

const
	httpServer = http.createServer(app),
	httpsServer = https.createServer(credentials, app)


httpServer .listen(HTTP_PORT, IP, () =>
	console.log(`Server is running at http://${IP}:${ HTTP_PORT}`) )
httpsServer.listen(HTTPS_PORT, IP, () =>
	console.log(`Server is running at https://${IP}:${HTTPS_PORT}`) )
