// 創建一個新文件 scripts/getGmailToken.js
import { google } from 'googleapis'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 載入 .env 文件
dotenv.config({ path: path.join(__dirname, '../.env') })

// 簡化的 OAuth2 客戶端
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID_EMAIL,
  process.env.GOOGLE_CLIENT_SECRET_EMAIL,
  'https://developers.google.com/oauthplayground'
)

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN_EMAIL
})

// 使用更簡單的方式獲取 token
oauth2Client.refreshAccessToken()
  .then(response => {
    console.log('\nNew Access Token:', response.credentials.access_token)
  })
  .catch(error => {
    console.error('Error:', error.message)
  })
