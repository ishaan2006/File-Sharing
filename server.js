
const
	fs = require("fs"),
	express = require("express"),
	http = require("http"),
	https = require("https"),
	app = express(),

	// openssl req -nodes -x509 -days 730 -newkey rsa:4096 -keyout server.key -out server.crt
	privateKey = fs.readFileSync("server.key", "utf-8"),
	certificate = fs.readFileSync("server.crt", "utf-8"),
	credentials = { key: privateKey, cert: certificate },


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
	}\n`,
	corsOptions = {
		methods: allowedMethods,
		optionsSuccessStatus: 200,
		credentials: true, // Enable credentials (e.g., cookies, authorization headers)
	}

app.use(function setOrigin(req, res, next) {
	res.setHeader("Access-Control-Allow-Origin",
		allowedOrigins.includes(req.headers.origin) ?
			req.headers.origin :
			allowedOrigins[0]
	)

	res.setHeader("Access-Control-Allow-Methods", allowedMethods)

	res.setHeader("Access-Control-Allow-Credentials", "true")

	next()
})


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
			return fs.readFileSync("./public/error-template.html", "utf-8")
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


app.post("/upload.html", (req, res) => {
	if (!allowedOrigins.map(e => e + "/upload.html").concat(
		allowedOrigins.map(e => e.replace(/:\d+$/, "") + "/upload.html")
	).includes( req.referrer )) {
		res.logRequest(404)
		res.sendFailurePage("404 Not Found")

		return
	}

	// store 

	res.logRequest(200)
	res.setHeader("Content-Type", "text/html")

	res.sendFile("results.html", {root: ROOT})
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


const
	httpServer = http.createServer(app),
	httpsServer = https.createServer(credentials, app)

console.log("Routers created")

httpServer .listen(HTTP_PORT, IP, () =>
	console.log(`Server is running at http://${IP}:${ HTTP_PORT}`) )
httpsServer.listen(HTTPS_PORT, IP, () =>
	console.log(`Server is running at https://${IP}:${HTTPS_PORT}`) )
