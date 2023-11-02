// garbage collection

import {normalize as normalizePath} from "path"
import * as db                      from "./db.js"
import shredFileSync                from "./shred-file.js"
import fs                           from "fs"

export async function collect() {
	// collect garbage

	const client = await db.connect()
	const main = client.db("File-Sharing").collection("main")
	const now = Date.now()

	const elements = main.find({
		projectedDeleteTime: { $gt: now },
		usesRemaining: { $ne: 0 }
	}).toArray()

	await Promise.all(
		elements.map(e => Promise.all([
			db.remove(e.fileHash, { removeFile: true, input: "hash" }),
			e.sensitive ?
				shredFileSync(e.relativeFileLocation) :
				fs.rm(e.relativeFileLocation)
		]))
	)
}

export async function handleBreach() {
	// shred sensitive files
	// TODO: alert users of the breach and deletion

	const client = await db.connect()
	const main = client.db("File-Sharing").collection("main")
	const elements = await main.find({ sensitive: true }).toArray()

	const promise = Promise.all(
		elements.map(e => db.remove(e.fileHash, {
			removeFile: true,
			input: "hash"
		}))
	)

	// do things while waiting for the promise to resolve
	for (const value of elements)
		shredFileSync(value.relativeFileLocation)

	await promise
}

if (normalizePath(import.meta.url) === normalizePath(`file://${process.argv[1].replace(/\\/g, "/")}`))
	// main program
	await collect()
