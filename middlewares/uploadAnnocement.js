import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import { CloudinaryStorage } from 'multer-storage-cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
})

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'announcements',
    resource_type: 'auto', // 允許上傳各種類型的文件
    allowed_formats: [
      // 圖片格式
      'jpg', 'jpeg', 'png', 'gif', 'webp',
      // 文件格式
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      // 壓縮檔
      'zip', 'rar'
    ]
  }
})

const upload = multer({
  storage,
  fileFilter (req, file, callback) {
    // 定義允許的 MIME types
    const allowedMimeTypes = [
      // 圖片
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      // 文件
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // 壓縮檔
      'application/zip',
      'application/x-rar-compressed'
    ]

    if (allowedMimeTypes.includes(file.mimetype)) {
      callback(null, true)
    } else {
      callback(new Error('FORMAT'), false)
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
}).array('attachments', 10) // 最多同時上傳 10 個檔案

export default (req, res, next) => {
  upload(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: '檔案太大，限制為10MB'
        })
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: '超過檔案數量限制，最多10個檔案'
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
          message: '檔案格式不支援'
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
