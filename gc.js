// garbage collection

import {normalize as normalizePath} from "path"
import * as mongoOps                from "./mongo-operations.js"
import shredFile                    from "./shred-file.js"
import fs                           from "fs"

export async function collect() {
	// collect garbage
	const dbEntries = await mongoOps.getAll().map(e => Object.entries(e)[0])

	for (const [key, value] of dbEntries) {
		if (Date.now() < value.projectedDeleteTime)
			continue

		mongoOps.remove(key) // do this first because it is asynchronous
		value.sensitive ?
			shredFile(value.relativeFileLocation) :
			fs.rmSync(value.relativeFileLocation)
	}
}

export async function handleBreach() {
	// shred sensitive files

	const dbEntries = (await mongoOps.getAll()).map(e => Object.entries(e)[0])

	for (const [key, value] of dbEntries) {
		if (!value.sensitive)
			continue

		mongoOps.remove(key)
		shredFile(value.relativeFileLocation)
	}
}

if (normalizePath(import.meta.url) === normalizePath(`file://${process.argv[1].replace(/\\/g, "/")}`))
	// main program
	collect()
