var fs = require('fs');
var crypto = require('crypto');

function MetaManipulator(intervalTimeout, maxTimeout) {
	this.isReady = false;
	this.meta = {};
	this.sessions = {};
	this.intervalTimeout = 600000;
	this.maxTimeout = 3600000;

	var self = this;

	console.log('Loading MetaManipulator');

	if (intervalTimeout > 0) {
		self.intervalTimeout = intervalTimeout;
	}
	if (maxTimeout > 0) {
		self.maxTimeout = maxTimeout;
	}

	setInterval(function() {
		var sessionKeyHashs = Object.keys(self.sessions);
		for (var i = 0; sessionKeyHashs.length > i; i++) {
			var sessionKeyHash = sessionKeyHashs[i];
			var session = self.sessions[sessionKeyHash];
			session.currentTime += 2000;
			if (session.currentTime >= session.expiration) {
				self.deAuth(sessionKeyHash);
			}
		}
	}, 2000);

	self.importMeta();
}
MetaManipulator.prototype.importMeta = function() {
	var self = this;

	console.log('Importing Metadata...');

	new Promise(function(resolve, reject) {
		fs.readFile('./database/meta.json', function(err, data) {
			if (err) {
				reject();
			} else {
				resolve(data);
			}
		});
	})
	.then(function(data) {
		self.meta = JSON.parse(data);
		self.isReady = true;
		console.log('Metadata imported from file');
	})
	.catch(function() {
		console.log('Error importing Metadata via file');
	});
}
MetaManipulator.prototype.createNewSession = function(sessionKey, databaseId, roleId) {
	var self = this;

	var sessions = self.sessions;

	if (sessionKey) {
		sessionKeyHash = createHash(sessionKey)
		if (!sessions[sessionKeyHash]) {
			var role = self.meta[databaseId].roles[roleId];

			var session = {
				"roleId": roleId,
				"databaseId": databaseId,
				"permissions": role.permissions,
				"scope": role.scope,
				"expiration": self.intervalTimeout,
				"currentTime": 0
			}

			sessions[sessionKeyHash] = session;

			return sessionKey;
		}
	}
	return false;
}
// Authorization related function
MetaManipulator.prototype.isAuth = function(databaseId, roleId, sessionKey, permission) {
	var self = this;

	if (self.checkAuth(databaseId, roleId, sessionKey, permission)) {
		self.extendAuth(sessionKey);
		return true;
	}
	return false;
}
MetaManipulator.prototype.checkAuth = function(databaseId, roleId, sessionKey, permission) {
	// Implement Role Scope
	var self = this;

	var sessionKeyHash = createHash(sessionKey);

	var session = self.sessions[sessionKeyHash];
	if (session) {
		if (session.databaseId == databaseId && session.roleId == roleId) {
			var permissions = session.permissions;
			for (var i = 0; permissions.length > i; i++) {
				if (permissions[i] == permission) {
					return true;
					break;
				}
			}
		}
	}
	return false;
}
MetaManipulator.prototype.attemptAuth = function(databaseId, roleId, key) {
	var self = this;

	var database = self.meta[databaseId];
	if (database && database.roles[roleId]) {
		var role = database.roles[roleId];

		if (role.key == createHash(key, role.salt)) {
			return new Promise(function(resolve, reject) {
				randomSessionKey().then(function(sessionKey) {
					resolve(self.createNewSession(sessionKey, databaseId, roleId));
				})
				.catch(function() {
					reject();
				});
			});
		}
	}
	return new Promise(function(resolve, reject) {
		reject();
	});
}
MetaManipulator.prototype.deAuth = function(sessionKeyHash) {
	var self = this;

	if (self.sessions[sessionKeyHash]) {
		delete self.sessions[sessionKeyHash];
		return true;
	}
	return false
}
MetaManipulator.prototype.extendAuth = function(sessionKey) {
	var self = this;

	sessionKeyHash = createHash(sessionKey);

	var session = self.sessions[sessionKeyHash];
	if (session) {
		session.expiration = session.currentTime + self.intervalTimeout;
		if (session.expiration > self.maxTimeout) {
			session.expiration = self.maxTimeout;
		}
		return true;
	}
	return false;
}
// Album meta retrival functions
MetaManipulator.prototype.getAlbumLength = function(databaseId, albumId) {
	var self = this;

	var database = self.meta[databaseId];
	if (database && database.structure[albumId]) {
		return database.structure[albumId].length;
	} else {
		return false;
	}
}
MetaManipulator.prototype.getAlbumClusterId = function(databaseId, albumId) {
	var self = this;

	var database = self.meta[databaseId];
	if (database && database.structure[albumId]) {
		return database.cluster[albumId];
	} else {
		return false;
	}
}
MetaManipulator.prototype.albumExists = function(databaseId, albumId) {
	var self = this;

	var database = self.meta[databaseId];
	if (database && database.structure[albumId]) {
		return true;
	} else {
		return false;
	}
}
// Album meta manipulation functions
MetaManipulator.prototype.changeAlbumLength = function(databaseId, albumId, newLength) {
	var self = this;

	var database = self.meta[databaseId];
	if (database && database.structure[albumId]) {
		database.structure[albumId].length = newLength;
		return true;
	} else {
		return false;
	}
}
// Implement addtion and subtraction of roles

// Internal functions
function randomSessionKey() {
	return new Promise(function(resolve, reject) {
		crypto.randomBytes(64, function(err, salt) {
			if (err) {
				reject(false);
			} else {
				resolve(salt.toString('hex'));
			}
		});
	});
}

function randomSalt() {
	return new Promise(function(resolve, reject) {
		crypto.randomBytes(64, function(err, salt) {
			if (err) {
				reject(false);
			} else {
				resolve(salt.toString('hex'));
			}
		});
	});

}

function createHash(text, salt) {
	if (salt === undefined) {
		salt = "";
	}
	return crypto.createHash('sha512').update(salt+text, 'utf8').digest('hex');
}

module.exports = MetaManipulator;