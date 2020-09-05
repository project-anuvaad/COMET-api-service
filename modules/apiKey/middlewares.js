const ApiKey = require('../shared/models').ApiKey

const ALLOWED_PERMISSIONS = [
    'admin',
    'project_leader',
    'review',
    'break_videos',
    'transcribe_text',
    'approve_transcriptions',
    'translate',
    'voice_over_artist',
    'translate_text',
    'approve_translations',
];

const middlewares = {
    authorizeOrganizationOwner: content => function (req, res, next) {
        const { organization } = req[content];
        const userRoles = req.user.organizationRoles;
        if (userRoles && userRoles.length > 0) {
            const orgRole = userRoles.find(u => u.organization._id.toString() === organization.toString());
            if (orgRole && (orgRole.organizationOwner)) {
                return next();
            }
        }
        return res.status(401).send('Unauthorized')
    },
    authorizeDeletekey: function (req, res, next) {
        const { apiKeyId } = req.params;
        ApiKey.findById(apiKeyId)
            .then((apiKey) => {
                if (!apiKey) throw new Error('Invalid api key');
                const organization = apiKey.organization;
                const userRoles = req.user.organizationRoles;
                if (userRoles && userRoles.length > 0) {
                    const orgRole = userRoles.find(u => u.organization._id.toString() === organization.toString());
                    if (orgRole && (orgRole.organizationOwner)) {
                        return next();
                    }
                }
                return res.status(401).send('Unauthorized')
            })
            .catch(err => {
                console.log(err);
                return res.status(400).send(err.message);
            })
    },
    validateOrigins: function (req, res, next) {
        let { origins, keyType } = req.body;
        if (keyType === 'service') return next();
        origins = origins.map(o => {
            let newOrg = o;
            if (newOrg.indexOf('https://') !== -1) {
                newOrg.replace('https://', '')
            } else if (newOrg.indexOf('http://') !== -1) {
                newOrg.replace('http://', '');
            }
            return newOrg.toLowerCase();
        })
        let valid = true;
        origins.forEach(origin => {
            if (origin.split('.').length < 2) {
                valid = true;
            }
        });
        if (valid) return next();
        return res.status(400).send('Invalid origin format: website.com|website.org');
    },
    validatePermissions: function (req, res, next) {
        const { permissions, keyType } = req.body;
        if (keyType === 'service') return next();
        let valid = true;
        // VALIDATE PERMISSIONS
        permissions.forEach(p => {
            if (ALLOWED_PERMISSIONS.indexOf(p) === -1) {
                valid = false;
            }
        });
        if (valid) return next();
        return res.status(400).send('Invalid permissions: ' + ALLOWED_PERMISSIONS.join('|'));
    },
}

module.exports = middlewares;