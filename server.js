
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


	allowedMethods = "GET,OPTIONS",

	HTTPS_PORT = 443,
	HTTP_PORT = 80,
	IP = "127.0.0.1",
	allowedOrigins = [
		`https://${IP}:${HTTPS_PORT}`, `https://localhost:${HTTPS_PORT}`,
		`http://${IP}:${HTTP_PORT}`, `http://localhost:${HTTP_PORT}`,
	],
	allowedGetLocations = ["/index.html", "/upload.html", "/robots.txt", "/favicon.ico"],
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

	res.setHeader("Access-Control-Allow-Methods", allowedMethods);

	res.setHeader("Access-Control-Allow-Credentials", "true")

	next()
})

function failurePage(method, loc, msg = "Invalid Request", linkHome = true) {
	if (typeof loc !== "string")
		loc = loc.url; // assume it is an express request object thing

	try {
		return fs.readFileSync("./404-template.html", "utf-8")
			.replace("{method}", method)
			.replace("{location}", loc)
			.replace("{message}", msg)
			.replace("{link}", linkHome ? '<a href="/">return to homepage</a>' : "")
	} catch {
		return msg ?? "Invalid Request";
	}
}


app.get("/", (req, res) => {
	console.log(`${req.ip}:${req.connection.remotePort} requesting '/' over ${req.protocol}; use '/index.html', sending 303`)

	res.redirect(303, "/index.html")
})

for (let loc of allowedGetLocations)
	app.get(loc, (req, res) => {
		console.log(`${req.ip}:${req.connection.remotePort} requesting '${loc}' over ${req.protocol}; sending 200`)

		res.status(200)
		res.sendFile(__dirname + "/public" + loc)
	})

app.get("*", (req, res) => {
	console.log(`${req.ip}:${req.connection.remotePort} requesting '${req.url}' over ${req.protocol}; sending 404`)

	res.setHeader("Content-Type", "text/html")
	res.status(404)
	res.send( failurePage("GET", req, "404 Not Found") )
})

app.options("*", (req, res) => {
	console.log(`${req.ip}:${req.connection.remotePort} requesting options over ${req.protocol}; sending 200`)

	res.setHeader("Allow", allowedMethods)
	res.setHeader("Content-Type", "text/plain")

	res.status(200)

	res.send(allowedGetLocationsString)
})

app.all("*", (req, res) => {
	console.log(`${req.ip}:${req.connection.remotePort} requesting invalid method ${req.method} over ${req.protocol}; closing connection and sending 405`)

	res.setHeader("Content-Type", "text/plain")
	res.setHeader("Connection", "close")

	res.status(405)

	res.send(`Invalid method: ${req.method}\nclosing connection\n`)
})


const
	httpServer = http.createServer(app),
	httpsServer = https.createServer(credentials, app)

httpServer .listen(HTTP_PORT, IP, () =>
	console.log(`Server is running at http://${IP}:${ HTTP_PORT}`) )
httpsServer.listen(HTTPS_PORT, IP, () =>
	console.log(`Server is running at https://${IP}:${HTTPS_PORT}`) )
