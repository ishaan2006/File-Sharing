import { MongoClient } from "mongodb"
import fs from "fs"

export const url = "mongodb://127.0.0.1:27017/"

// all these functions could be async functions

export function connect() {
	return MongoClient.connect(url)
}

export function add(element) {
	return connect().then(async client => {
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
	}).catch(err =>
		console.log("error fetching MongoDB resoureces", err)
	)
}

export function update(element) {
	return connect().then(async client => {
		const db = client.db("File-Sharing")
		const main = db.collection("main")

		const query = {
			[fileDigest]: { $exists: true }
		}

		const updates = {
			projectedDeleteTime : element[fileDigest].projectedDeleteTime,
			usesRemaining       : element[fileDigest].usesRemaining,
			originalName        : element[fileDigest].originalName,
		}

		// you can go up in sensitivity, but not down
		if (element[fileDigest].sensitive)
			updates.sensitive = true

		const fileDigest = Object.keys(element)[0]

		await collection.updateOne(query, { $set: updates })

		// the secondary collection shouldn't have changed

		client.close()
	}).catch(err =>
		console.log("error fetching MongoDB resoureces:", err)
	)
}

export function get(key) {
	return connect().then(async client => {
		const db = client.db("File-Sharing")
		const main = db.collection("main")

		// TODO: there might be an error here
		let ret = await main.findOne({
			[key]: { $exists: true }
		})

		client.close()

		return ret
	}).catch(err =>
		console.log("error fetching MongoDB resoureces", err)
	)
}

export function remove(key) {
	return connect().then(async client => {
		const db = client.db("File-Sharing")
		const main = db.collection("main")
		const secondary = db.collection("user-keys")
		const values = Object.values( get(key) )[0]

		// only remove from the secondary database if it is there
		values.userFriendlyId == null ||
			secondary.deleteOne({
				[values.userFriendlyId]: { $exists: true }
			})

		// delete the file
		fs.exists(values.relativeFileLocation) &&
			fs.rm(values.relativeFileLocation)

		await main.deleteOne({
			[key]: { $exists: true }
		})

		client.close()
	}).catch(err =>
		console.log("error fetching MongoDB resoureces", err)
	)
}

export function getAll() {
	return connect().then(async client => {
		const db = client.db("File-Sharing")
		const main = db.collection("main")
		const docs = await main.find({}).toArray()

		client.close()

		return docs
	}).catch(err =>
		console.log("error fetching MongoDB resoureces", err)
	)
}
