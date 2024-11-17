// ticketUpload.js
import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import { CloudinaryStorage } from 'multer-storage-cloudinary'

// 配置 Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
})

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'tickets', // 存在 tickets 資料夾
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'], // 允許的格式
    transformation: [{ width: 800, height: 800, crop: 'limit' }] // 限制最大尺寸，保持原比例
  }
})

// 創建 multer 實例
const ticketUpload = multer({
  storage,
  fileFilter (req, file, callback) {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(null, true)
    } else {
      callback(new Error('FORMAT'), false)
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB
  }
}).array('images', 5) // 最多5張圖片

export default (req, res, next) => {
  ticketUpload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: '圖片不能超過2MB'
        })
      } else if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: '最多只能上傳5張圖片'
        })
      }
      return res.status(400).json({
        success: false,
        message: '上傳錯誤'
      })
    } else if (error) {
      if (error.message === 'FORMAT') {
        return res.status(400).json({
          success: false,
          message: '只能上傳 jpg/png 格式的圖片'
        })
      }
      return res.status(500).json({
        success: false,
        message: '未知錯誤'
      })
    }
    next()
  })
}
