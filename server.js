// for now everything assumes that client requests are valid and non-malicious


/* DATABASE NOTES:
MAIN DATABASE:

file hash -> [
	sensitive, // delete file on db breach,
	relative file location,
	projected delete date,
	user-friendly id,
	uses remaining,
	password hash,
	store date,
	salt,
]

SECONDARY DATABASE:

user-friendly id -> file hash
*/

import {getHash, verifyHash} from "./private/passwords.js"
import { execSync }          from "child_process"
import express               from "express"
import crypto                from "crypto"
import multer                from "multer"
import https                 from "https"
import { dirname, extname }  from "path"
import http                  from "http"
import { fileURLToPath }     from "url"
import fs                    from "fs"

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const
	upload = multer(),
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
		"/index.html",
		"/upload.html",
		"/robots.txt",
	],
	allowedGetMiscellaneousLocations = [
		"/styles.css",
		"/favicon.ico",
		"/error-template.html",
		"/results.html",
	],
	allowedGetLocations = allowedGetAddressLocations.concat(allowedGetMiscellaneousLocations
	),
	allowedGetLocationsString = `Allowed paths for GET: ${
		["/"].concat(allowedGetLocations).map(e => `'${e}'`).join(", ")
	}\n`

function formatJSON(code="{}", {
	objectNewline     = true,
	tab               = "\t",
	newline           = "\n",
	space             = " ",
	arrayOneLine      = true,
	arrayOneLineSpace = " ", // if " ", [ ITEM ]. if "\t", [\tITEM\t]. etc
}={}) {
	if (typeof code !== "string")
		throw TypeError`formatJSON() requires a string`;

	try { JSON.parse(code) }
	catch { throw TypeError`formatJSON() requires a JSON string` }

	if (/^\s*\{\s*\}\s*$/.test(code))
		return "{}";
	if (/^\s*\[\s*\]\s*$/.test(code))
		return "[]";
	if (/^("|'|`)(.|\n)*\1$/.test( code.replace(/\s+/g, "") ))
		return code.replace(/(^\s*)|(\s*$)/g, "");

	for (var i = 0, n = code.length, tabs = 0, output = "", inString = !1; i < n; i++) {
		if (code[i] === '"' && code[i - 1] !== '\\')
			inString = !inString;

		if (inString)
			output += code[i];
		else if (/\s/.test(code[i]))
			continue;
		else if (code[i] === "{")
			output += `${code[i]}${newline}${tab.repeat(++tabs)}`;
		else if (code[i] === "[") {
			if (!arrayOneLine) {
				output += `${code[i]}${newline}${tab.repeat(++tabs)}`;
				continue;
			}
			for (let arrayInString = !1, index = i + 1 ;; index++) {
				if (code[index] === '"' && code[index - 1] !== '\\')
					arrayInString = !arrayInString;
				if (arrayInString) continue;
				if (["{", "[", ","].includes(code[index])) {
					output += `${code[i]}${newline}${tab.repeat(++tabs)}`;
					break;
				} else if (code[index] === "]") {
					output += `[${arrayOneLineSpace}${
						code.substring(i + 1, index)
					}${arrayOneLineSpace}]`;
					i = index;
					break;
				}
			}
		} else if (["}", "]"].includes(code[i]))
			output += `${newline}${tab.repeat(--tabs)}${code[i]}`;
		else if (code[i] === ":")
			output += `${code[i]}${space}`;
		else if (code[i] === ",") {
			// objectNewline === true : }, {
			// objectNewline === false: },\n\t{
			let s = code.slice(i);
			output += code[i] + (!objectNewline &&
				code[i + 1 + s.length - s.replace(/^\s+/, "").length] === "{" ?
					`${space}` :
					`${newline}${tab.repeat(tabs)}`
			);
		}
		else
			output += code[i];
	}

	return output;
}

function formatAsJSON(object = {}) {
	return formatJSON( JSON.stringify(object) )
}

function escapeHTML(str, {tabLength = 6}={}) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/ /g, "&nbsp;")
		.replace(/\t/g, "&nbsp;".repeat(tabLength))
		.replace(/\n/g, "<br>")
}

function formatAsJSONHTML(object = {}) {
	return escapeHTML(
		formatAsJSON(object)
	)
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

function shredFile(filepath, passes = 6) {
	// for files marked as sensitive.
	// returns `true` on success, `false` on fail

	if (!fs.existsSync(filepath))
		return false;

	try {
		var i, fd = fs.openSync(filepath, "w")

		const stats = fs.fstatSync(fd)

		if (!stats.isFile())
			return false

		const pwshFilepath = filepath.replace(/([ "'`])/g, "`$1")
		const data = Buffer.allocUnsafe(stats.size)

		// hide file
		execSync(`powershell -c "$file.Attributes = [IO.FileAttributes]::Hidden"`)

		// shred creation time
		for (i = passes; i --> 0 ;)
			// the dates are slightly more likely to be the endpoints than other values
			execSync(`powershell -c "` +
				`$file = Get-Item ${pwshFilepath};` +
				// some date in [1/1/1979 12:00:00 AM, 12/31/2107 11:59:59 PM]
				// dates outside the range are invalid and throw an error
				`$file.CreationTime = [DateTimeOffset]::FromUnixTimeSeconds(` +
					`[Math]::Clamp(${
						crypto.randomBytes(4).readInt32BE(0)
					}, 315446400, 4354819199)` +
				`).DateTime` +
			`"`)

		// shred file data
		for (i = passes; i --> 0 ;)
			fs.writeSync(fd, crypto.randomFillSync(data))

		// shred access and write times
		for (i = passes; i --> 0 ;)
			fs.futimesSync(fd,
				crypto.randomBytes(4).readInt32BE(0),
				crypto.randomBytes(4).readInt32BE(0),
			)

		// set data back to zeros
		fs.writeSync(fd, data.fill(0))
		fs.futimesSync(fd, 0, 0)

		// delete file
		fs.rmSync(filepath)
	}
	catch {
		// permission error or something
		return false
	}
	finally {
		fs.closeSync(fd)
	}

	return true
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

app.use(express.json())

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
				res.status(returncode.ret);

			newline = returncode.lf ?? true;
			message = returncode.msg ?? "";
			returncode = returncode.ret ?? 200;
		}
		else if (arguments.length)
			res.status(returncode);

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
			return msg ?? "Invalid Request";
		}
	}

	res.sendFailurePage = function sendFailurePage() {
		res.setHeader("Content-Type", "text/html")
		res.send( res.failurePage(...arguments) )

		return this
	}

	next()
})

app.post("/upload.html", upload.single("file"), (req, res) => {

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
	const originalExtension = extname("a" + file.originalname)

	body.originalname = file.originalname
	body.url = "<unknown>"
	body.destination = UPLOAD_DESTINATION + fileDigest + originalExtension + ".tmp"

	const exists = fs.existsSync(body.destination)
	body.action = exists ? "update" : "upload"

	// `file.buffer` is not defined in the multer.diskStorage() callbacks
	if (exists) {
		console.log("file already exists");
		// TODO: update information other than passwords.
		// TODO: let the user know somehow that passwords can't be updated by re-uploading
	}
	else
		fs.writeFileSync(body.destination, file.buffer)

	// TODO: update the main database
	// TODO: update the secondary database

	req.logRequest(200)

	console.log("body:", body)
	console.log("file:", file)

	res.setHeader("Content-Type", "text/html")

	res.send(
		applyTemplate("./public/results.html", {
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

app.get(/\/(home|index)?$/, (req, res) => {
	req.logRequest(303, "use '/index.html'")

	res.redirect(303, "/index.html")
})

// simplify the requests
app.get(/\/(upload|download|delete)$/, (req, res) => {

	req.logRequest(303, `use '${req.url + ".html"}'`)

	res.redirect(303, req.url + ".html")
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
