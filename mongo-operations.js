import { MongoClient } from "mongodb"
import fs from "fs"

export const url = "mongodb://127.0.0.1:27017/"

// all these functions could be async functions

export function connect() {
	// returns a promise
	return MongoClient.connect(url)
}

export async function add(element) {
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")
	const secondary = db.collection("user-keys")
	const entries = Object.entries(element)[0]

	await Promise.all([
		// only use the secondary database if there is a user-friendly id
		entries[1].userFriendlyId == null ||
			secondary.insertOne({
				[entries[1].userFriendlyId]: entries[0]
			}),
		main.insertOne(element)
	])

	client.close()
}

export async function update(element) {
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")
	const fileDigest = Object.keys(element)[0]

	const query = {
		[fileDigest]: { $exists: true }
	}

	const updates = { [fileDigest]: {
		projectedDeleteTime : element[fileDigest].projectedDeleteTime,
		usesRemaining       : element[fileDigest].usesRemaining,
		originalName        : element[fileDigest].originalName,
	} }

	// you can go up in sensitivity, but not down.
	// this really only affects deletion.
	if (element[fileDigest].sensitive)
		updates[fileDigest].sensitive = true

	await main.updateOne(query, { $set: updates })

	// the secondary collection shouldn't need to be changed...
	// so we don't need to update it here
	// The file digest is inherant to the identity of the file,
	// and you can't change the user-friendly id

	client.close()
}

export async function get(key, {decrementUses=false, removeFile=false, input="hash"}={}) {
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")

	if (input !== "hash" && input !== "short-id")
		throw Error`input must be a hash or a short id`


	const query = input === "hash" ? {
		[key]: { $exists: true }
	} : {
		[something]: {
			userFriendlyId: key
		}
	}

	const ret = await main.findOne(query)


	if (decrementUses && ret[key].usesRemaining > 0) {
		const updates = { [key]: {
			usesRemaining: --ret[key].usesRemaining
		} }

		await main.updateOne(query, { $set: updates })

		client.close()

		if (ret[key].usesRemaining === 0)
			await remove(key, removeFile)
	} else
		client.close()

	return ret
}

export async function remove(key, removeFile=true) {
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")
	const secondary = db.collection("user-keys")
	const values = Object.values(await get(key, false, false))[0]

	await Promise.all([
		// only remove from the secondary database if it is there
		values.userFriendlyId == null ||
			secondary.deleteOne({
				[values.userFriendlyId]: { $exists: true }
			}),
		removeFile && fs.existsSync(values.relativeFileLocation) &&
			fs.rm(values.relativeFileLocation),
		main.deleteOne({
			[key]: { $exists: true }
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

export async function lookup(key, type, dcr) {
	throw Error`Not Implemented`
	// get the file content

	if (type === "hash")
		return await get(key, true, false)

}