import { Schema, model, ObjectId } from 'mongoose';

const companySchema = new Schema({
  name: {
    type: String,
    required: [true, '請輸入公司名稱'],
    unique: true
  },
  departments: [{
    type: ObjectId,
    ref: 'departments' // 參照 department 模型
  }]
});

export default model('companies', companySchema);