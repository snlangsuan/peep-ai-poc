import admin from 'firebase-admin'

import { envVariables } from '#/factory'

const privateKey = envVariables.GOOGLE_AUTH_PRIVATE_KEY.replace(/\\n/g, '\n')

export const storageBucketName =
  envVariables.FIREBASE_STORAGE_BUCKET || `${envVariables.GOOGLE_PROJECT_ID}.appspot.com`

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: envVariables.GOOGLE_PROJECT_ID,
      clientEmail: envVariables.GOOGLE_AUTH_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
    databaseURL: envVariables.FIREBASE_DATABASE_URL,
    storageBucket: storageBucketName,
  })
}

export const db = admin.firestore()
export const rtdb = admin.database()
export const storage = admin.storage()
export const firebase = admin
