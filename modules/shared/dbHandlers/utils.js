const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

module.exports = {
    normalizeQueryParams(params) {
        Object.keys(params).forEach((key) => {
            if (key === '_id' && typeof params[key] === 'string') {
                params[key] = ObjectId(params[key]);
            }
        })
        return params;
    },
    toObjectId: (str) => ObjectId(str.toString()),
}