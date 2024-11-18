import { Schema, model } from 'mongoose'

const companySchema = new Schema({
  name: {
    type: String,
    required: [true, '請輸入公司名稱'],
    unique: true
  },
  companyId: {
    type: String,
    required: [true, '請輸入公司編號'],
    unique: true
  }
}, {
  timestamps: true,
  versionKey: false
})

export default model('companies', companySchema)
