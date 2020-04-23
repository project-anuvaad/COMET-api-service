const process = global.process;
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
  app.use('/api/whatsapp-webhook', createProxyRouter(process.env.WHATSAPP_BOT_API_ROOT))

  app.use('/api/auth', createProxyRouter(process.env.AUTH_SERVICE_API_ROOT));

  app.use('/api/invitations', createProxyRouter(process.env.INVITATION_RESPONSE_API_SERVICE_API_ROOT));
  // Upload contribute video
  app.use('/api/videoTutorialContribution', createProxyRouter(process.env.VIDEO_TUTORIAL_CONTRIBUTION_API_SERVICE_API_ROOT));

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
              if (!user) throw new Error('Invalid user')
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
      const apiKeySecretVal = req.header('vw-x-user-api-key-secret');
      if (apiKeyVal) {
        apiKeyService.findOne({ key: apiKeyVal })
          .then((apiKey) => {
            if (!apiKey) return res.status(400).send('Invalid api key');
            if (apiKey.keyType === 'service' && (!apiKeySecretVal || apiKeySecretVal !== apiKey.secret)) {
              return res.status(401).send('invalid header vw-x-user-api-key-secret value')
            }
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
                console.log('something went wrong', err)
                return res.status(400).send('Something went wrong');
              })
          })
      } else {
        next();
        // return res.status(401).send('Unauthorized');
      }
    }
  });

  const { createProxyMiddleware } = require('http-proxy-middleware');
  /* Server Routes */
  const ROUTES = [
    {
      path: '/api/video',
      proxyTo: process.env.VIDEO_API_SERVICE_API_ROOT,
    },
    {
      path: '/api/user',
      proxyTo: process.env.USER_API_SERVICE_API_ROOT,
    },
    {
      path: '/api/article',
      proxyTo: process.env.ARTICLE_API_SERVICE_API_ROOT,
    },
    {
      path: '/api/translate',
      proxyTo: process.env.TRANSLATION_API_SERVICE_API_ROOT,
    },
    {
      path: '/api/translationExport',
      proxyTo: process.env.TRANSLATION_EXPORT_API_SERVICE_API_ROOT,
    },
    {
      path: '/api/comment',
      proxyTo: process.env.COMMENT_API_SERVICE_API_ROOT,
    },
    {
      path: '/api/organization',
      proxyTo: process.env.ORGANIZATION_API_SERVICE_API_ROOT,
    },
    {
      path: '/api/notification',
      proxyTo: process.env.NOTIFICATION_API_SERVICE_API_ROOT,
    },
    {
      path: '/api/subtitles',
      proxyTo: process.env.SUBTITLES_API_SERVICE_API_ROOT,
    },
    {
      path: '/api/noiseCancellationVideo',
      proxyTo: process.env.NOISE_CANCELLATION_VIDEO_API_SERVICE_API_ROOT,
    },
    {
      path: '/api/apikey',
      proxyTo: process.env.APIKEY_API_SERVICE_API_ROOT,
    },
    {
      path: '/api/noiseCancellation',
      proxyTo: process.env.NOISE_CANCELLATION_API_SERVICE_API_ROOT,
    }
  ]
  ROUTES.forEach((route) => {
    const proxy = createProxyMiddleware({
      target: `http://` + route.proxyTo,
      pathRewrite: function(path) {
        let newPath = path.replace(new RegExp(`^${route.path}/?`, 'i'), '/')
        console.log(path, '===================================================', newPath)
        if (newPath.indexOf('/db') === 0 || newPath.indexOf('db') === 0) {
          newPath.replace('db', '')
        }
        return newPath
      }
    })
    app.use(route.path, proxy)

  })
  // app.use('/api/video', createProxyRouter(process.env.VIDEO_API_SERVICE_API_ROOT));
  // app.use('/api/user', createProxyRouter(process.env.USER_API_SERVICE_API_ROOT));
  // app.use('/api/article', createProxyRouter(process.env.ARTICLE_API_SERVICE_API_ROOT));
  // app.use('/api/translate', createProxyRouter(process.env.TRANSLATION_API_SERVICE_API_ROOT));
  // app.use('/api/translationExport', createProxyRouter(process.env.TRANSLATION_EXPORT_API_SERVICE_API_ROOT));
  // app.use('/api/comment', createProxyRouter(process.env.COMMENT_API_SERVICE_API_ROOT));
  // app.use('/api/organization', createProxyRouter(process.env.ORGANIZATION_API_SERVICE_API_ROOT))
  // app.use('/api/notification', createProxyRouter(process.env.NOTIFICATION_API_SERVICE_API_ROOT))
  // app.use('/api/subtitles', createProxyRouter(process.env.SUBTITLES_API_SERVICE_API_ROOT))

  // app.use('/api/noiseCancellationVideo', createProxyRouter(process.env.NOISE_CANCELLATION_VIDEO_API_SERVICE_API_ROOT))
  // app.use('/api/apikey', createProxyRouter(process.env.APIKEY_API_SERVICE_API_ROOT));

  // app.use('/api/noiseCancellation', createProxyRouter(process.env.NOISE_CANCELLATION_API_SERVICE_API_ROOT))

  // const bodyParser = require('body-parser');
  // app.use(bodyParser.json({ limit: '50mb' })) // parse application/json
  // app.use(bodyParser.json({ type: 'application/vnd.api+json' })) // parse application/vnd.api+json as json
  // app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' })) // parse application/x-www-form-urlencoded


  app.get('/*', (req, res) => {
    console.log(req.path)
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
  const proxyParams = {
    limit: '500mb',
    filter(req) {
      return req.path.indexOf('/db') !== 0 && req.path.indexOf('/api/db') !== 0;
    }
  }
  console.log('creating proxy for', TARGET)
  return require('express-http-proxy')(TARGET, proxyParams);
}


// const apiKeyVal = req.header('vw-x-user-api-key');
// const apiKeySecretVal = req.header('vw-x-user-api-key-secret');

// setTimeout(() => {
//   const superagent = require('superagent');
//   let superdebug = require('superagent-debugger');
  
//   const fs = require('fs');
//   [1,2,3,4,5,6,7,8,9,10].forEach((a) => {
//     // [1].forEach(() => {

//     superagent.post(`http://localhost:4000/api/noiseCancellation/audio`)
//     .set('vw-x-user-api-key', 'fa2c4f2e-e415-44f5-8dc5-c2ac2ef6d59e-1587095552652')
//     .set('vw-x-user-api-key-secret', '8d250fa7-c7eb-4117-995a-60a9154a40dc-1587095552652')
//     .attach('file', fs.createReadStream('audio-930a4b9b-ac1a-4295-8707-50747400a6a2.mp3'))
//     .use(superdebug.default(console.info))
    
//     .then(res => {
//       fs.writeFileSync('cleared2.mp3', res.body)
//     })
//     .catch(err => {
//       console.log(err)
//     })
//   })
// }, 2000);