import { google } from 'googleapis'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export async function appendToSheet(values: (string | number)[][]) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
    range: 'Sheet1!A1',
    valueInputOption: 'RAW',
    requestBody: { values },
  })
}

export async function appendToNamedSheet(sheetName: string, values: (string | number)[][][]) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
    range: `'${sheetName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  })
}

async function ensureSheetExists(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetName: string
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
  const exists = meta.data.sheets?.some(s => s.properties?.title === sheetName)
  if (exists) return
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  })
}

export async function clearAndWriteSheet(sheetName: string, values: (string | number | boolean)[][]) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!
  await ensureSheetExists(sheets, spreadsheetId, sheetName)
  const range = `'${sheetName}'!A1:Z10000`
  await sheets.spreadsheets.values.clear({ spreadsheetId, range })
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  })
}

export async function readSheet(range = 'Sheet1!A1:Z1000') {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
    range,
  })
  return response.data.values ?? []
}
