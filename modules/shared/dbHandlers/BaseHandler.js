class BaseHandler {
  constructor(model) {
    this.model = model;
  }

  find(conditions) {
    if (!conditions) {
      conditions = {};
    }
    return this.model.find(conditions);
  }

  findById(videoId) {
    return this.model.findById(videoId);
  }

  findOne(query) {
    return this.model.findOne(query);
  }

  create(values) {
    return this.model.create(values);
  }

  update(conditions, keyValMap, options = {}) {
    return this.model.updateMany(conditions, { $set: keyValMap }, options);
  }

  updateMany(conditions, keyValMap, options = {}) {
    return this.model.updateMany(conditions, { $set: keyValMap }, options);
  }

  updateById(id, keyValMap) {
    return this.model.findByIdAndUpdate(id, { $set: keyValMap }, { new: true });
  }

  findByIdAndUpdate(id, keyValMap) {
    return this.model.findByIdAndUpdate(id, { $set: keyValMap }, { new: true });
  }

  updateOne(conditions, update) {
    this.model.updateOne(conditions, update);
  }

  remove(conditions) {
    return this.model.remove(conditions);
  }

  count(conditions) {
    return this.model.count(conditions);
  }
}

module.exports = BaseHandler;
