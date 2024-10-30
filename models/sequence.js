// models/sequence.js
import { Schema, model } from 'mongoose'

const schema = new Schema({
  name: {
    type: String,
    required: true
  },
  value: {
    type: Number,
    required: true
  }
})

export default model('sequences', schema)
