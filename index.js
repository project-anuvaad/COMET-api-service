const process = global.process;
const express = require('express')
const morgan = require('morgan')
const methodOverride = require('method-override')
const compression = require('compression')

const app = express()
const server = require('http').Server(app);


const PORT = process.env.PORT || 4000;

app.all('/*', (req, res, next) => {
    // CORS headers - Set custom headers for CORS
    res.header('Access-Control-Allow-Origin', '*'); // restrict it to the required domain
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-type,Accept,X-Access-Token, vw-x-user-api-key-secret, vw-x-user-api-key, X-Vw-Anonymous-Id, X-Key, Cache-Control, X-Requested-With');
    if (req.method === 'OPTIONS') {
        res.status(200).end();
    } else {
        next();
    }
});
app.use(morgan('dev')) // use morgan to log requests to the console

app.get('/', (req, res) => {
    return res.status(200).send('API BASE')
})


// app.use(bodyParser.json({ limit: '50mb' })) // parse application/json
// app.use(bodyParser.json({ type: 'application/vnd.api+json' })) // parse application/vnd.api+json as json
// app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' })) // parse application/x-www-form-urlencoded

app.use(methodOverride('X-HTTP-Method-Override')) // override with the X-HTTP-Method-Override header in the request. simulate DELETE/PUT
app.use(compression({ threshold: 0 }))

require('./router/index.js')(app) // pass our application into our routes

console.log(' API GATEWAY SERVICE ');
server.listen(PORT)
console.log(`Magic happens on port ${PORT}`)       // shoutout to the user
console.log(`==== Running in ${process.env.NODE_ENV} mode ===`)
exports = module.exports = app             // expose app
// applyScriptMediaOnArticleOnAllArticles()
