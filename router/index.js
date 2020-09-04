const process = global.process;
const jwt = require('jsonwebtoken');

const express = require('express');

const apiKeyService = require('../modules/shared/services/apiKey');
const storageService = require('../modules/shared/services/storage');

const {
  SECRET_STRING,
  AWS_ACCESS_KEY_ID,
  AWS_ACCESS_KEY_SECRET,
  AWS_DEFAULT_REGION,
  AWS_BUCKET_NAME,
  MAILGUN_API_KEY,
  MAILGUN_DOMAIN,
  GOOGLE_CLOUD_PROJECT_ID,
  GOOGLE_CLOUD_CLIENT_EMAIL,
  GOOGLE_CLOUD_PRIVATE_KEY,
  FRONTEND_HOST_URL,
  FRONTEND_HOST_NAME,
  FRONTEND_HOST_PROTOCOL,
  API_ROOT,
  WEBSOCKET_SERVER_URL,
  AUDIO_PROCESSOR_API_ROOT,
  API_DB_CONNECTION_URL
} = process.env;

const userService = require('../modules/shared/services/user');
const { ApiKey } = require('../modules/shared/models');

const PUBLIC_ROUTES = [
  /^\/api\/organization\/(.)*\/invitations\/respond$/,
  /^\/api\/user\/resetPassword$/,
  /^\/api\/user\/subscribe_api_docs$/,
]

module.exports = (app) => {
  const rabbitmqService = require('../modules/shared/workers/vendors/rabbitmq');
  const RABBITMQ_SERVER = process.env.RABBITMQ_SERVER;
  let rabbitmqChannel;

   // initiate rabbitmq connection
  rabbitmqService.createChannel(RABBITMQ_SERVER, (err, channel) => {
      if (err) {
          throw err;
      }
      channel.prefetch(5, false)
      rabbitmqChannel = channel;
      channel.on('error', (err) => {
          console.log('RABBITMQ ERROR', err)
          process.exit(1);
      })
      channel.on('close', () => {
          console.log('RABBITMQ CLOSE')
          process.exit(1);
      })
  // Decode uri component for all params in GET requests
  app.get('/health', (req, res) => {
    const envVars = [
      { AWS_ACCESS_KEY_ID },
      { AWS_ACCESS_KEY_SECRET },
      { AWS_DEFAULT_REGION },
      { AWS_BUCKET_NAME },
      { MAILGUN_API_KEY },
      { MAILGUN_DOMAIN },
      { GOOGLE_CLOUD_PROJECT_ID },
      { GOOGLE_CLOUD_CLIENT_EMAIL },
      { GOOGLE_CLOUD_PRIVATE_KEY },
      { FRONTEND_HOST_URL },
      { FRONTEND_HOST_NAME },
      { FRONTEND_HOST_PROTOCOL },
      { API_ROOT },
      { WEBSOCKET_SERVER_URL },
      { AUDIO_PROCESSOR_API_ROOT },
      { API_DB_CONNECTION_URL }
    ];
    const unavailableKeys = [];
    for (let i = 0; i < envVars.length; i++) {
      let envVar = envVars[i];
      Object.keys(envVar).forEach(key => {
        if (!envVar[key]) {
          unavailableKeys.push(key);
        }
      })
    }
    if (unavailableKeys.length > 0) {
      const msg =  'The following environment variables are not properly set ' + unavailableKeys.join(', ')
      console.log(msg)
      return res.status(503).send(msg)
    }
    storageService.getBucketLocation()
    .then(() => {
      return res.status(200).send('OK');
    })
    .catch(err => {
      const msg = 'Invalid configuration for aws s3 bucket';
      console.log(msg)
      console.log(err)
      return res.status(503).send(msg)
    })
  })

  app.get('*', (req, res, next) => {
    if (req.query) {
      Object.keys(req.query).forEach((key) => {
        req.query[key] = decodeURIComponent(req.query[key]);
      })
    }

    return next();
  });
  const bodyParser = require('body-parser');
  const compression = require('compression');
  const methodOverride = require('method-override');
  app.use(bodyParser.json({ limit: '1024mb' })) // parse application/json
  app.use(bodyParser.json({ type: 'application/vnd.api+json' })) // parse application/vnd.api+json as json
  app.use(bodyParser.urlencoded({ extended: true, limit: '1024mb' })) // parse application/x-www-form-urlencoded
  app.use(methodOverride('X-HTTP-Method-Override')) // override with the X-HTTP-Method-Override header in the request. simulate DELETE/PUT
  app.use(compression({ threshold: 0 }))


  if (process.env.WHATSAPP_BOT_API_ROOT) {
    app.use('/api/whatsapp-webhook', createProxyRouter(process.env.WHATSAPP_BOT_API_ROOT))
  }

  const authModule = require('../modules/auth')
  app.use('/api/auth', authModule.routes.mount(createRouter()))
  // app.use('/api/auth', createProxyRouter(process.env.AUTH_SERVICE_API_ROOT));

  // app.use('/api/invitations', createProxyRouter(process.env.INVITATION_RESPONSE_API_SERVICE_API_ROOT));
  const invitationsReponseModule = require('../modules/invitationsResponse')
  app.use('/api/invitations', invitationsReponseModule.routes.mount(createRouter()))
  // Upload contribute video
  // app.use('/api/videoTutorialContribution', createProxyRouter(process.env.VIDEO_TUTORIAL_CONTRIBUTION_API_SERVICE_API_ROOT));
  const videoTutorialContributionModule = require('../modules/videoTutorialContribution')
  app.use('/api/videoTutorialContribution', videoTutorialContributionModule.routes.mount(createRouter()))

  app.use(async (req, res, next) => {
    let token = req.header('x-access-token');
    // Skip public routes regexs
    if (PUBLIC_ROUTES.some(s => req.path.match(s))) return next();

    if (token) {
      jwt.verify(token, SECRET_STRING, (err, decoded) => {
        if (err) {
          console.log('token verify error', err)
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
              apiKeyService.find({ user: req.user._id })
              .then((apiKeys) => {
                userData.organizationRoles.forEach((role) => {
                  const apiKey = apiKeys.find(k => k.organization.toString() === role.organization._id.toString());
                  if (!apiKey || !apiKey.key) {
                    apiKeyService.generateApiKey().then(key => {
                      return ApiKey.updateOne({
                        organization: role.organization._id,
                        user: userData._id,
                        userKey: true,
                       }, { $set: {
                        key,
                        origins: [role.organization.name.replace(/\s/g, '-').toLowerCase() + '.' + process.env.FRONTEND_HOST_NAME],
                        active: true,
                       }},{ upsert: true })
                    })
                      .then(() => {
                      })
                      .catch(err => {
                        console.log('error creating api key', err)
                      })
                  } 
                })

              })
              .catch(err => {
                  console.log('error api key', err)
              })
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
        const whatsappBotKey = req.headers['vw-x-whatsapp-bot-key']
        if (whatsappBotKey && whatsappBotKey === process.env.WHATSAPP_BOT_API_KEY) {
          return next();
        }
        // next();
        return res.status(401).send('Unauthorized');
      }
    }
  });


  const { createProxyMiddleware } = require('http-proxy-middleware');
  /* Server Routes */
  const ROUTES = [
    // {
    //   path: '/api/video',
    //   proxyTo: process.env.VIDEO_API_SERVICE_API_ROOT,
    // },
    // {
    //   path: '/api/user',
    //   proxyTo: process.env.USER_API_SERVICE_API_ROOT,
    // },
    // {
    //   path: '/api/article',
    //   proxyTo: process.env.ARTICLE_API_SERVICE_API_ROOT,
    // },
    // {
    //   path: '/api/translate',
    //   proxyTo: process.env.TRANSLATION_API_SERVICE_API_ROOT,
    // },
    // {
    //   path: '/api/translationExport',
    //   proxyTo: process.env.TRANSLATION_EXPORT_API_SERVICE_API_ROOT,
    // },
    // {
    //   path: '/api/comment',
    //   proxyTo: process.env.COMMENT_API_SERVICE_API_ROOT,
    // },
    // {
    //   path: '/api/organization',
    //   proxyTo: process.env.ORGANIZATION_API_SERVICE_API_ROOT,
    // },
    // {
    //   path: '/api/notification',
    //   proxyTo: process.env.NOTIFICATION_API_SERVICE_API_ROOT,
    // },
    // {
    //   path: '/api/subtitles',
    //   proxyTo: process.env.SUBTITLES_API_SERVICE_API_ROOT,
    // },
    // {
    //   path: '/api/noiseCancellationVideo',
    //   proxyTo: process.env.NOISE_CANCELLATION_VIDEO_API_SERVICE_API_ROOT,
    // },
    // {
    //   path: '/api/apikey',
    //   proxyTo: process.env.APIKEY_API_SERVICE_API_ROOT,
    // },
    {
      path: '/api/noiseCancellation',
      proxyTo: process.env.NOISE_CANCELLATION_API_SERVICE_API_ROOT,
    },
    // {
    //   path: '/api/folder',
    //   proxyTo: process.env.FOLDER_API_SERVICE_API_ROOT,
    // }
  ]
  ROUTES.forEach((route) => {
    const proxy = createProxyMiddleware({
      target: `http://` + route.proxyTo,
      pathRewrite: function (path) {
        let newPath = path.replace(new RegExp(`^${route.path}/?`, 'i'), '/')
        if (newPath.indexOf('/db') === 0 || newPath.indexOf('db') === 0) {
          newPath.replace('db', '')
        }
        return newPath
      },
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

  const apiKeyModule = require('../modules/apiKey');
  app.use('/api/apikey', apiKeyModule.routes.mount(createRouter()));

  const userModule = require('../modules/user')
  app.use('/api/user', userModule.routes.mount(createRouter()))

  const articleModule = require('../modules/article')
  app.use('/api/article', articleModule.routes.mount(createRouter()))
  
  const videoModule = require('../modules/video')
  app.use('/api/video', videoModule.routes.mount(createRouter(), rabbitmqChannel))
  
  const commentModule = require('../modules/comment');
  app.use('/api/comment', commentModule.routes.mount(createRouter(), rabbitmqChannel))

  const folderModule = require('../modules/folder');
  app.use('/api/folder', folderModule.routes.mount(createRouter()))

  const notificationModule = require('../modules/notification')
  app.use('/api/notification', notificationModule.routes.mount(createRouter()))

  const organizationModule = require('../modules/organization')
  app.use('/api/organization', organizationModule.routes.mount(createRouter()))

  const subtitlesModule = require('../modules/subtitles')
  app.use('/api/subtitles', subtitlesModule.routes.mount(createRouter(), rabbitmqChannel))

  const translationModule = require('../modules/translation')
  app.use('/api/translate', translationModule.routes.mount(createRouter(), rabbitmqChannel))
  
  const translationExportModule = require('../modules/translationExport')
  app.use('/api/translationExport', translationExportModule.routes.mount(createRouter(), rabbitmqChannel))
  
  const noiseCancellationVideoModule = require('../modules/noiseCancellationVideo')
  app.use('/api/noiseCancellationVideo', noiseCancellationVideoModule.routes.mount(createRouter(), rabbitmqChannel))
  
  app.get('/*', (req, res) => {
    res.status(404).send('Not found');
  });

  })
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
