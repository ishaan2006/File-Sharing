
const
	express = require("express"),
	multer = require("multer"),
	https = require("https"),
	sha3 = require("js-sha3"),
	http = require("http"),
	fs = require("fs"),

	upload = multer(),
	app = express(),
	read = (location, encoding="utf-8") => fs.readFileSync(location, encoding),

	// openssl req -nodes -x509 -days 730 -newkey rsa:4096 -keyout server.key -out server.crt
	privateKey = read("server.key"),
	certificate = read("server.crt"),
	credentials = { key: privateKey, cert: certificate },
	getHash = sha3.sha3_224, // TODO: eventually change this to sha3_512.


	allowedMethods = "GET,POST,OPTIONS",
	ROOT = __dirname + "/public",
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
	allowedGetLocations = allowedGetAddressLocations.concat(allowedGetMiscellaneousLocations),
	allowedGetLocationsString = `Allowed paths for GET: ${
		["/"].concat(allowedGetLocations).map(e => `'${e}'`).join(", ")
	}\n`

app.use(function setOrigin(req, res, next) {
	// cors
	res.setHeader("Access-Control-Allow-Origin",
		allowedOrigins.includes(req.headers.origin) ?
			req.headers.origin :
			allowedOrigins[0]
	)

	res.setHeader("Access-Control-Allow-Methods", allowedMethods)

	res.setHeader("Access-Control-Allow-Credentials", "true")

	next()
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))


app.use(function (req, res, next) {
	req.port = req.connection.remotePort
	req.ipport = `${req.ip}:${req.port}`
	req.referrer = req.get("referrer") ?? "direct address"
	req.directAddress = req.referrer === "direct address"

	req.logRequest =
	res.logRequest = function logRequest(
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
			return read("./public/error-template.html")
				.replace("{method}", req.method)
				.replace("{location}", req.url)
				.replace("{message}", msg)
				.replace("{link}", linkHome ? '<a href="/">return to homepage</a>' : "")
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
		res.logRequest(404)
		res.sendFailurePage("404 Not Found")

		return
	}

	const body = JSON.parse(req.body.json ?? null);
	body.filename = req.file.originalname;


	// store the file and update the databases

	res.logRequest(200)

	console.log(body)
	console.log(req.file)

	res.setHeader("Content-Type", "text/html")

	res.send(
		read("./public/results.html")
			.replace("{results}", "results: " + JSON.stringify(req.body))
	)
})

app.get(/\/(home|index)?$/, (req, res) => {
	res.logRequest(303, "use '/index.html'")

	res.redirect(303, "/index.html")
})

// simplify the requests
app.get(/\/(upload|download|delete)$/, (req, res) => {

	res.logRequest(303, `use '${req.url + ".html"}'`)

	res.redirect(303, req.url + ".html")
})


for (let loc of allowedGetAddressLocations)
	app.get(loc, (req, res) => {
		res.logRequest(200)

		res.sendFile(loc, {root: ROOT})
	})

for (let loc of allowedGetMiscellaneousLocations)
	app.get(loc, (req, res) => {

		if (req.directAddress) {
			res.logRequest(403)
			res.sendFailurePage("403 Forbidden")

			return
		}

		res.logRequest(200)
		res.sendFile(loc, {root: ROOT})
	})


app.get("*", (req, res) => {
	res.logRequest(404)

	res.status(404)
	res.sendFailurePage("404 Not Found")
})

app.options("*", (req, res) => {
	res.logRequest(200)

	res.setHeader("Allow", allowedMethods)
	res.setHeader("Content-Type", "text/plain")

	res.send(allowedGetLocationsString)
})



app.all("*", (req, res) => {
	res.logRequest(405, "invalid method, closing connection")

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
