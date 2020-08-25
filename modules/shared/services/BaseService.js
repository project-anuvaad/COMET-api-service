class BaseService {
  constructor(dbHandler) {
    this.dbHandler = dbHandler;
  }

  find(conditions) {
    if (!conditions) {
      conditions = {};
    }
    return this.dbHandler.find(conditions);
  }

  findById(videoId) {
    return this.dbHandler.findById(videoId);
  }
  findByIdAndUpdate(id, keyValMap) {
    return this.updateById(id, keyValMap)
  }
  findOne(query) {
    return this.dbHandler.findOne(query);
  }

  create(values) {
    return this.dbHandler.create(values);
  }

  update(conditions, keyValMap, options = {}) {
    return this.dbHandler.updateMany(conditions, keyValMap, options);
  }

  updateById(id, keyValMap) {
    return this.dbHandler.findByIdAndUpdate(id, keyValMap, { new: true });
  }

  updateOne(conditions, update) {
    this.dbHandler.updateOne(conditions, update);
  }

  remove(conditions) {
    return this.dbHandler.remove(conditions);
  }

  count(conditions) {
    return this.dbHandler.count(conditions);
  }
}

module.exports = BaseService;
