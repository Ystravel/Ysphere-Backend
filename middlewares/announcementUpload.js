import multer from 'multer'
import path from 'path'
import fs from 'fs'

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.env.UPLOAD_PATH, 'announcements')

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const filename = uniqueSuffix + path.extname(file.originalname).toLowerCase()
    cb(null, filename)
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

    // 處理上傳的文件
    if (req.files) {
      req.files = req.files.map(file => ({
        path: file.path.replace(/\\/g, '/'),
        filename: file.originalname,
        fileType: file.mimetype.split('/')[0],
        mimeType: file.mimetype,
        size: file.size
      }))
    }

    next()
  })
}
