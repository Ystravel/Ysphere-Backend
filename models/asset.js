import { Schema, model } from 'mongoose'

const assetSchema = new Schema({
  name: {
    type: String,
    required: [true, '請輸入設備名稱']
  }

})

export default model('assets', assetSchema)
