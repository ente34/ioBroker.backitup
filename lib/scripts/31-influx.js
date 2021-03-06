'use strict';

const child_process = require('child_process');
const getDate = require('../tools').getDate;
const path = require('path');
const fs = require('fs');
const targz = require('targz');
const os = require('os');

function cleanTmpDir(dirname, log) {
	if (fs.existsSync(dirname)) {
		try {
			if (fs.lstatSync(dirname).isDirectory()) {
				let files = fs.readdirSync(dirname);
				files.forEach(file => {
					fs.unlinkSync(path.join(dirname, file));
				});
				fs.rmdirSync(dirname);
			} else {
				fs.unlinkSync(dirname);
			}
			log.debug('influx tmp directory removed!');
		} catch (e) {
			log.error('influx tmp directory cannot removed: ' + e);
		}
	}
}

function command(options, log, callback) {
	const fileName = path.join(options.backupDir, `influx_${getDate()}_backupiobroker.tar.gz`);

    // Get the separator from the path module
    const { sep } = require('path');
    const tmpDir = os.tmpdir();
    const dirNameInflux=fs.mkdtempSync(`${tmpDir}${sep}`);
    log.debug('Start influx Backup (' + dirNameInflux + ') ==> ' + fileName);

    cleanTmpDir(dirNameInflux, log);

	if (!fs.existsSync(dirNameInflux)) {
		try {
			fs.mkdirSync(dirNameInflux);
		} catch (e) {
			callback('Backup folder not created: ' + e + ' Please reinstall bakitup and run "iobroker fix"!!');
		}
	}

	options.context.fileNames.push(fileName);

    //Remove enclosing "" if any
    let exe = `${options.exe ? options.exe : 'influxd'}`;
    if ( exe.charAt(0) === '"')
    {
         exe = exe.substring(1);
         exe = exe.slice(0, -1);
    }

	child_process.exec(`"${exe}" backup -portable "${dirNameInflux}" `, (error, stdout, stderr) => {
		if (error) {
    	    options.context.errors.influx = error.toString();
    		let errLog = '' + error;
			callback(errLog, stderr);
			callback = null;
            cleanTmpDir(dirNameInflux, log);
		} else {
			let timer = setInterval(() => {
				if (fs.existsSync(fileName)) {
					const stats = fs.statSync(fileName);
					const fileSize = Math.floor(stats.size / (1024 * 1024));
					log.debug('Packed ' + fileSize + 'MB so far...');
				}
			}, 10000);

			targz.compress({
				src: dirNameInflux,
				dest: fileName,
			}, (err, stdout, stderr) => {

				clearInterval(timer);
                cleanTmpDir(dirNameInflux, log);

				if (err) {
	                options.context.errors.influx = err.toString();
					if (callback) {
						callback(err, stderr);
						callback = null;
					}
				} else {
                    log.debug('Backup created: ' + fileName);

					options.context.done.push('influx');
					options.context.types.push('influx');

				    if (callback) {
						callback(null, stdout);
						callback = null;
					}
				}
			});
		}
	});
}

module.exports = {
	command,
	ignoreErrors: true
};