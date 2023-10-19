import { execSync } from "child_process"
import crypto       from "crypto"
import fs           from "fs"


export default function shredFile(filepath, passes = 6) {
	// for deleting files marked as sensitive.
	// returns `true` on success, `false` on fail

	if (!fs.existsSync(filepath))
		return false

	try {

		var i, fd = fs.openSync(filepath, "w")

		const stats = fs.fstatSync(fd)

		if (!stats.isFile())
			return false

		const pwshFilepath = filepath.replace(/([ "'`])/g, "`$1")
		const data = Buffer.allocUnsafe(stats.size)

		try {

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

		} catch {
			// powershell is not there
			// maybe try `pwsh`?
		}

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
