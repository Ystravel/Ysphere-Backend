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
    folder: 'avatars', // 指定 Cloudinary 上的文件夾
    allowed_formats: ['jpg', 'png', 'webp'], // 允許的格式
    transformation: [{ width: 200, height: 200, crop: 'fill' }] // 圖片處理設置
  }
})

// 創建 multer 實例
const upload = multer({
  storage,
  fileFilter (req, file, callback) {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(null, true)
    } else {
      callback(new Error('FORMAT'), false)
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024 // 1MB
  }
}).single('image') // 使用 single() 而不是創建一個中間件函數

export default (req, res, next) => {
  upload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: '檔案太大'
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
          message: '檔案格式錯誤'
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
