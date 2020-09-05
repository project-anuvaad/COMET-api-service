const uuid = require('uuid').v4;
const async = require('async');
const ApiKey = require('../shared/models').ApiKey;
const utils = require('./utils');
const {
    userService,
    organizationService
} = require('../shared/services')
// const userService = require('../shared/services/user');
// const organizationService = require('../shared/services/organization')

const controller = {
    create: function(req, res) {
        const { keyType, organization, permissions, origins } = req.body;
        let newApiKey = {};
        let orgRole = {
            organization,
            organizationOwner: false,
            inviteStatus: 'accepted',
            registerMethod: 'api',
            inviteToken: `${uuid()}_${uuid()}`,
        };
        if (keyType === 'platform') {
            orgRole.permissions = permissions;
        } else {
            orgRole.permissions = [];
        }

        let newUser = {
            firstname: `API`,
            lastname: `KEY`,
            email: uuid(),
            emailVerified: true,
            apiUser: true,
            organizationRoles: [orgRole]
        };

        userService.create(newUser)
        .then((userData) => {
            return new Promise((resolve, reject) => {
                newApiKey = {
                    organization,
                    user: userData._id,
                    key: utils.generateApiKey(),
                    active: true,
                    keyType,
                }
                if (keyType === 'platform') {
                    newApiKey.origins = origins;
                } else if (keyType === 'service') {
                    newApiKey.origins = ['*'];
                    newApiKey.secret = utils.generateApiKey();
                } else {
                    throw new Error('Unsupported keyType');
                }

                return ApiKey.create(newApiKey)
                .then(resolve)
                .catch(reject)
            })
        })
        .then(apiKeyData => {
            newApiKey = apiKeyData.toObject();
            // Update organization origins
            return organizationService.findById(organization)
        })
        .then((organization) => {
            console.log(organization)
            if (keyType === 'service') {
                return Promise.resolve();
            }
            let newOrigins = (organization.origins || []).slice();
            origins.forEach(origin => {
                if (newOrigins.indexOf(origin) === -1) {
                    newOrigins.push(origin);
                }
            });
            return organizationService.updateById(organization._id, { origins: newOrigins })
        })
        .then(() => userService.findById(newApiKey.user))
        .then(userData => {
            newApiKey.user = userData.toObject();
            res.json({ apiKey: newApiKey })
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message)
        })
    },

    get: function(req, res) {
        const { organization } = req.query;
        let apiKeys = [];
        ApiKey
        .find({ organization, userKey: { $ne: true } })
        .sort({ created_at: -1 })
        .then(apiKeysDocs => {
            apiKeysDocs.forEach((key) => {
                apiKeys.push(key.toObject());
            })
            const fetchUserArray =[];
            apiKeys.forEach((key) => {
                fetchUserArray.push((cb) => {
                    userService.findById(key.user)
                    .then((userData) => {
                        key.user = userData.toObject()
                        cb();
                    })
                    .catch(err => {
                        console.log(err);
                        cb()
                    })
                })
            })
            async.parallelLimit(fetchUserArray, 5, (err) => {
                if (err) {
                    console.log(err);
                }
                return res.json({ apiKeys })
            })
        })
        .catch(err => {
            console.log(err)
            return res.status(400).send('Something went wrong')
        })
    },

    delete: function(req, res) {
        const { apiKeyId } = req.params;
        let apiKey;
        ApiKey.findById(apiKeyId)
        .then((apiKeyDoc) => {
            apiKey = apiKeyDoc.toObject();
            return userService.remove({ _id: apiKeyDoc.user })
        })
        .then(() => ApiKey.remove({ _id: apiKeyId}))
        .then(() => res.json({ apiKey }))
        .catch(err => {
            console.log(err);
            return res.status(400).send('Something went wrong');
        })
    },

    getApiKeyByKey: function(req, res) {
        const { apiKey } = req.query;
        let apiKeyDoc;
        ApiKey.findOne({ key: apiKey })
        .then((apiKey) => {
            apiKeyDoc = apiKey.toObject();
            return organizationService.findById(apiKeyDoc.organization)
        })
        .then((organization) => {
            apiKeyDoc.organization = organization;
            return res.json({ apiKey: apiKeyDoc });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send('Something went wrong');
        })
    },

    getUserOrganizationKey: function(req, res) {
        const user = req.user;
        const { organization } = req.query;
        ApiKey.findOne({ user: user._id, organization })
        .then((apiKey) => {
            if (!apiKey) {
                const newApiKey = {
                    organization,
                    user: user._id,
                    key: utils.generateApiKey(),
                    origins: ['videowiki.org'],
                    active: true,
                    userKey: true,
                }
                ApiKey.create(newApiKey)
                .then((apiKey) => {
                    res.json({ apiKey })
                })
                .catch(err => {
                    console.log(err);
                    return res.status(400).send('Something went wrong');
                })
            } else {
                return res.json({ apiKey })
            }
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    }
}

module.exports = controller;