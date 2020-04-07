const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

const SECRET_STRING = process.env.SECRET_STRING;
const express = require('express');

const {
  USER_SERVICE_API_ROOT,
  APIKEY_SERVICE_API_ROOT,
} = process.env;

const userService = require('@videowiki/services/user')(USER_SERVICE_API_ROOT)
const apiKeyService = require('@videowiki/services/apiKey')(APIKEY_SERVICE_API_ROOT)

const PUBLIC_ROUTES = [
  /^\/api\/organization\/(.)*\/invitations\/respond$/,
  /^\/api\/user\/resetPassword$/,
  /^\/api\/user\/subscribe_api_docs$/,
]

module.exports = (app) => {
  // Decode uri component for all params in GET requests
  app.get('*', (req, res, next) => {
    if (req.query) {
      Object.keys(req.query).forEach((key) => {
        req.query[key] = decodeURIComponent(req.query[key]);
      })
    }

    return next();
  });

  app.use('/auth', createProxyRouter(process.env.AUTH_SERVICE_API_ROOT));

  app.use('/invitations', createProxyRouter(process.env.INVITATION_RESPONSE_API_SERVICE_API_ROOT));
  // Upload contribute video
  app.use('/videoTutorialContribution', createProxyRouter(process.env.VIDEO_TUTORIAL_CONTRIBUTION_API_SERVICE_API_ROOT));

  app.use(async (req, res, next) => {
    let token = req.header('x-access-token');
    // Skip public routes regexs
    if (PUBLIC_ROUTES.some(s => req.path.match(s))) return next();

    if (token) {
      jwt.verify(token, SECRET_STRING, (err, decoded) => {

        if (err) {
          return res.json({
            success: false,
            message: 'Token is not valid'
          });
        } else {
          req.decoded = decoded;
          let userData;
          userService.getUserByEmail(decoded.email)
            .then((user) => {
              req.user = user;
              userData = user;
              req.headers['vw-user-data'] = JSON.stringify(user)
              next();
              return Promise.resolve();
            })
            .then(() => {
              // BACKWARD COMPATABILITY
              // if the user doesn't have an associated api key, create one for him
              if (!userData.apiKey) {
                userData.organizationRoles.forEach((role) => {
                  apiKeyService.findOne({ user: req.user._id, organization: role.organization._id })
                    .then((apiKey) => {
                      console.log('================= API KEY ====================', apiKey)
                      if (!apiKey || !apiKey.key) {
                        apiKeyService.generateApiKey().then(key => {
                          return apiKeyService.create({
                            organization: role.organization._id,
                            user: userData._id,
                            key,
                            origins: [role.organization.name.replace(/\s/g, '-').toLowerCase() + '.' + process.env.FRONTEND_HOST_NAME],
                            active: true,
                            userKey: true,
                          })
                        })
                          .then((apiKey) => {
                            console.log('created api key', apiKey)
                          })
                          .catch(err => {
                            console.log('error creating api key', err)
                          })
                      }
                    })
                    .catch(err => {
                      console.log('error api key', err)
                    })
                })
                // organization: { type: Schema.Types.ObjectId, ref: SchemaNames.organization },
                // user: { type: Schema.Types.ObjectId, ref: SchemaNames.user },

                // key: String,
                // origins: [String],
                // active: { type: Boolean, default: true },

                // created_at: { type: Number, default: Date.now },
                // console.log(process.env)
              }
            })
            .catch((err) => {
              console.log(err);
              return res.json({ success: false, message: 'Something went wrong' })
            })
        }
      });
    } else {
      const apiKeyVal = req.header('vw-x-user-api-key');
      if (apiKeyVal) {
        apiKeyService.findOne({ key: apiKeyVal })
          .then((apiKey) => {
            if (!apiKey) return res.status(400).send('Invalid api key');
            userService.findById(apiKey.user)
            .then((userData) => {
              return userService.getUserByEmail(userData.email)
            })
            .then(user => {
              req.user = user;
              req.headers['vw-user-data'] = JSON.stringify(user)
              return next();
            })
            .catch(err => {
              console.log(err)
              return next();
            })
          })
      } else {
        next();
      }
    }
  });

  /* Server Routes */
  app.use('/user', createProxyRouter(process.env.USER_API_SERVICE_API_ROOT));
  app.use('/video', createProxyRouter(process.env.VIDEO_API_SERVICE_API_ROOT));
  app.use('/article', createProxyRouter(process.env.ARTICLE_API_SERVICE_API_ROOT));
  app.use('/translate', createProxyRouter(process.env.TRANSLATION_API_SERVICE_API_ROOT));
  app.use('/translationExport', createProxyRouter(process.env.TRANSLATION_EXPORT_API_SERVICE_API_ROOT));
  app.use('/comment', createProxyRouter(process.env.COMMENT_API_SERVICE_API_ROOT));
  app.use('/organization', createProxyRouter(process.env.ORGANIZATION_API_SERVICE_API_ROOT))
  app.use('/notification', createProxyRouter(process.env.NOTIFICATION_API_SERVICE_API_ROOT))
  app.use('/subtitles', createProxyRouter(process.env.SUBTITLES_API_SERVICE_API_ROOT))

  app.use('/noiseCancellationVideo', createProxyRouter(process.env.NOISE_CANCELLATION_VIDEO_API_SERVICE_API_ROOT))
  app.use('/apikey', createProxyRouter(process.env.APIKEY_API_SERVICE_API_ROOT));

  app.use(bodyParser.json({ limit: '50mb' })) // parse application/json
  app.use(bodyParser.json({ type: 'application/vnd.api+json' })) // parse application/vnd.api+json as json
  app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' })) // parse application/x-www-form-urlencoded

  // app.use('/noiseCancellationVideo', noiseCancellationVideoModule.routes.mount(createRouter()));
  // app.use('/apikey', apiKeyModule.routes.mount(createRouter()));

  app.get('/*', (req, res) => {
    res.status(404).send('Not found');
  });

}

function createProxyRouter(TARGET) {
  const router = createRouter();
  const httpProxy = createProxy(TARGET);
  router.all('*', (req, res, next) => httpProxy(req, res, next))
  return router;
}

function createRouter() {
  return express.Router()
}

function createProxy(TARGET) {
  return require('express-http-proxy')(TARGET, { limit: '500mb' });
}