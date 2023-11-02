import { pathFromDbObj } from "./rel-path.js"
import { MongoClient }   from "mongodb"
import fs                from "fs"

export const url = "mongodb://127.0.0.1:27017/"

export /* async */ function connect() {
	// returns a promise
	return MongoClient.connect(url)
}

export async function add(element) {
	const client = await connect()
	const db = client.db("File-Sharing")
	await db.collection("main").insertOne(element)

	client.close()
}

export async function update(element) {
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")

	const query = { fileDigest: element.fileDigest }

	// TODO: if projectedDeleteTime is 0, delete instead.
	const updates = {
		projectedDeleteTime : element.projectedDeleteTime,
		usesRemaining       : element.usesRemaining,
		originalName        : element.originalName,
	}

	// you can go up in sensitivity, but not down.
	// this really only affects deletion.
	// TODO: make this also effect encryption, because this will break it right now.
	if (element.sensitive)
		updates.sensitive = true

	await main.updateOne(query, { $set: updates })

	client.close()
}

export async function get(inputValue, {decrementUses=false, removeFile=false, input="hash"}={}) {
	// "removeFile" argument only removes the file if there are no uses left
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")

	if (input !== "hash" && input !== "short-id")
		throw Error`input must be a "hash" or a "short-id"`


	const query = { [input === "hash" ? "fileDigest" : "userFriendlyId"]: inputValue }

	const ret = await main.findOne(query)

	if (decrementUses && ret.usesRemaining > 0) {
		const updates = { $inc: { usesRemaining: -1 } }
		await main.updateOne(query, updates)

		client.close()

		if (ret.usesRemaining === 0)
			// TODO: figure out if this actually does what it is supposed to
			await remove(inputValue, removeFile)
	} else
		client.close()

	return ret
}

export async function remove(inputValue, {removeFile=false, input="hash"}={}) {
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")
	const values = await get(inputValue, { decrementUses: false, removeFile: false, input })

	const relPath = pathFromDbObj(values)

	await Promise.all([
		// only remove from the secondary database if it is there
		removeFile && fs.existsSync(relPath) &&
			fs.rm(relPath),
		main.deleteOne({
			[input === "hash" ? "fileDigest" : "userFriendlyId"]: inputValue
		})
	])

	client.close()
}

export async function getAll() {
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")
	const docs = await main.find({}).toArray()

	client.close()

	return docs
}

export async function lookup(inputValue, type, dcr) {
	throw Error`Not Implemented`
	// get the file content

	if (type === "hash")
		return await get(inputValue, { decrementUses: false, removeFile: false, input })

}
