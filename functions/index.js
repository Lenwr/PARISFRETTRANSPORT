const functions = require("firebase-functions")
const cors = require("cors")({ origin: true })
const twilio = require("twilio")
const admin = require("firebase-admin")
const crypto = require("crypto")

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

const twilioNumber = process.env.TWILIO_NUMBER
const twilioSenderId = process.env.TWILIO_SENDER_ID
const whatsappSender = process.env.TWILIO_WHATSAPP_SENDER || twilioNumber
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
const colisStatutTemplateSid = process.env.TWILIO_COLIS_STATUT_TEMPLATE_SID
const twilioStatusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL
const MAX_BROADCAST_RECIPIENTS = 100

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    throw new Error("Configuration Twilio manquante")
  }

  return twilio(accountSid, authToken)
}

function buildSmsPayload(body, to) {
  const payload = { body, to }

  if (messagingServiceSid) payload.messagingServiceSid = messagingServiceSid
  else if (twilioSenderId) payload.from = twilioSenderId
  else if (twilioNumber) payload.from = twilioNumber
  else throw new Error("TWILIO_SENDER_ID, TWILIO_NUMBER ou Messaging Service manquant")

  if (twilioStatusCallbackUrl) payload.statusCallback = twilioStatusCallbackUrl
  return payload
}

async function verifyRequestUser(req) {
  const authorization = req.headers.authorization || ""
  const match = authorization.match(/^Bearer (.+)$/)

  if (!match) {
    throw new Error("Authentification requise")
  }

  return admin.auth().verifyIdToken(match[1])
}

async function getUserData(uid) {
  const snap = await db.collection("users").doc(uid).get()
  return snap.exists ? snap.data() : null
}

async function validateCustomerBroadcast(decodedToken, body) {
  if (body?.source !== "customers") return null

  const userData = await getUserData(decodedToken.uid)
  const entrepriseId = userData?.entrepriseId

  if (!entrepriseId || body.entrepriseId !== entrepriseId) {
    const error = new Error("Accès refusé à cette diffusion")
    error.statusCode = 403
    throw error
  }

  const recipients = Array.isArray(body.recipients) ? body.recipients : []
  const customerIds = [
    ...new Set(
      recipients
        .map(item => String(item.customerId || "").trim())
        .filter(Boolean)
    )
  ]

  if (!customerIds.length || customerIds.length !== recipients.length) {
    const error = new Error("Clients invalides pour la diffusion")
    error.statusCode = 400
    throw error
  }

  if (customerIds.length > MAX_BROADCAST_RECIPIENTS) {
    const error = new Error(
      `Une diffusion est limitée à ${MAX_BROADCAST_RECIPIENTS} clients`
    )
    error.statusCode = 400
    throw error
  }

  const customers = []

  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10)
    const snap = await db
      .collection("customers")
      .where(admin.firestore.FieldPath.documentId(), "in", chunk)
      .where("entrepriseId", "==", entrepriseId)
      .get()

    if (snap.size !== chunk.length) {
      const error = new Error("Un ou plusieurs clients ne sont pas accessibles")
      error.statusCode = 403
      throw error
    }

    snap.docs.forEach(document => {
      const customer = document.data()
      if (customer.smsOptOut === true || customer.smsConsent === false) return

      customers.push({
        customerId: document.id,
        phone: customer.telephone,
        prenom: customer.prenom || "",
        nom: customer.nom || ""
      })
    })
  }

  return { entrepriseId, customers }
}

function normalizePhone(phone) {
  if (!phone) return null

  let cleaned = String(phone)
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .replace(/[^\d+]/g, "")

  if (!cleaned) return null
  if (cleaned.startsWith("00")) cleaned = `+${cleaned.slice(2)}`
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    cleaned = `+33${cleaned.slice(1)}`
  } else if (!cleaned.startsWith("+")) {
    cleaned = `+${cleaned}`
  }

  return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null
}

function buildMessage(template, data) {
  return String(template || "")
    .replace(/\{\{\s*expediteur\s*\}\}/gi, data.expediteur || "Expéditeur")
    .replace(/\{\{\s*destinataire\s*\}\}/gi, data.destinataire || "Client")
    .replace(/\{\{\s*prenom\s*\}\}/gi, data.prenom || "")
    .replace(/\{\{\s*nom\s*\}\}/gi, data.nom || "")
    .replace(/\{\{\s*client\s*\}\}/gi, data.client || data.destinataire || "Client")
    .replace(/\{\{\s*telephone\s*\}\}/gi, data.telephone || "")
    .replace(/\{\{\s*numero\s*\}\}/gi, data.numero || "-")
    .replace(/\{\{\s*destination\s*\}\}/gi, data.destination || "-")
    .replace(/\{\{\s*statut\s*\}\}/gi, data.statut || "-")
    .replace(/\{\{\s*entreprise\s*\}\}/gi, data.entreprise || "TrackSend")
}

function hasSuperAdminRole(userData, decodedToken) {
  const role = String(userData?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]/g, "")

  return Boolean(
    decodedToken?.superAdmin ||
    role === "superadmin" ||
    userData?.isSuperAdmin === true ||
    userData?.superAdmin === true
  )
}

exports.sendBroadcastSMS = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({
          success: false,
          error: "Méthode non autorisée"
        })
      }

      const decodedToken = await verifyRequestUser(req)
      const validation = await validateCustomerBroadcast(decodedToken, req.body || {})

      const { statut, customMessage, entreprise } = req.body || {}
      const recipients = validation?.customers || req.body?.recipients

      if (!Array.isArray(recipients) || !recipients.length) {
        return res.status(400).json({
          success: false,
          error: "Recipients manquant"
        })
      }

      const template =
        customMessage ||
        "Bonjour {{expediteur}}, votre colis {{numero}} pour {{destination}} est maintenant : {{statut}}."

      const uniqueRecipients = [
        ...new Map(
          recipients
            .map(item => {
              const phone = normalizePhone(item.phone)

              if (!phone) return null

              return [
                phone,
                {
                  ...item,
                  phone
                }
              ]
            })
            .filter(Boolean)
        ).values()
      ]

      if (!uniqueRecipients.length) {
        return res.status(400).json({
          success: false,
          error: "Aucun client éligible (téléphone ou consentement SMS)"
        })
      }

      const campaignRef = db.collection("smsCampaigns").doc()
      await campaignRef.set({
        entrepriseId: validation?.entrepriseId || null,
        createdBy: decodedToken.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        template,
        total: uniqueRecipients.length,
        sent: 0,
        failed: 0,
        status: "sending"
      })

      const results = []

      for (const recipient of uniqueRecipients) {
        try {
          const body = buildMessage(template, {
            expediteur: recipient.expediteur,
            destinataire: recipient.destinataire,
            prenom: recipient.prenom,
            nom: recipient.nom,
            client: recipient.client || recipient.destinataire || recipient.expediteur,
            telephone: recipient.phone,
            numero: recipient.numero,
            destination: recipient.destination,
            statut,
            entreprise
          })

          const twilioPayload = buildSmsPayload(body, recipient.phone)

          const sms = await getTwilioClient().messages.create(twilioPayload)

          results.push({
            customerId: recipient.customerId || null,
            phone: recipient.phone,
            success: true,
            sid: sms.sid,
            status: sms.status,
            message: body
          })
        } catch (error) {
          results.push({
            customerId: recipient.customerId || null,
            phone: recipient.phone,
            success: false,
            error: error.message,
            code: error.code || null
          })
        }
      }

      const sent = results.filter(item => item.success).length
      await campaignRef.set(
        {
          sent,
          failed: results.length - sent,
          status: sent === results.length ? "sent" : sent ? "partial" : "failed",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          results: results.map(item => ({
            customerId: item.customerId,
            phone: item.phone,
            success: item.success,
            sid: item.sid || null,
            status: item.status || null,
            error: item.error || null
          }))
        },
        { merge: true }
      )

      return res.status(200).json({
        success: true,
        campaignId: campaignRef.id,
        sent,
        total: uniqueRecipients.length,
        results
      })
    } catch (error) {
      console.error("Erreur broadcast SMS :", error)

      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.statusCode ? error.message : "Erreur interne",
        details: error.message
      })
    }
  })
})

exports.sendClientRequestInvites = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Méthode non autorisée" })
      }

      const decodedToken = await verifyRequestUser(req)
      const userData = await getUserData(decodedToken.uid)
      const entrepriseId = userData?.entrepriseId
      const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : []
      const appUrl = String(req.body?.appUrl || "").replace(/\/+$/, "")
      const passage = req.body?.passage === "done" ? "done" : "todo"

      if (!entrepriseId || !recipients.length || recipients.length > 20) {
        return res.status(400).json({ success: false, error: "Destinataires invalides" })
      }

      if (!/^https?:\/\//.test(appUrl)) {
        return res.status(400).json({ success: false, error: "URL application invalide" })
      }

      const results = []

      for (const item of recipients) {
        const phone = normalizePhone(item.phone)
        const name = String(item.name || "Client").trim().slice(0, 120)
        const address = String(item.address || "").trim().slice(0, 300)

        if (!phone) {
          results.push({ phone: item.phone || "", success: false, error: "Téléphone invalide" })
          continue
        }

        try {
          const token = crypto.randomBytes(24).toString("hex")
          const inviteRef = db.collection("clientRequestInvites").doc(token)
          const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 14 * 24 * 60 * 60 * 1000)
          const link = `${appUrl}/#/demande/${token}`
          const intro = passage === "done"
            ? "Suite au passage de notre chauffeur, merci de compléter votre demande"
            : "Pour organiser le passage de notre chauffeur, merci de compléter votre demande"
          const body = `Bonjour ${name}, ${intro} : ${link}`

          await inviteRef.set({
            entrepriseId,
            name,
            phone,
            address,
            passage,
            status: "sent",
            createdBy: decodedToken.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt
          })

          const twilioPayload = buildSmsPayload(body, phone)

          const sms = await getTwilioClient().messages.create(twilioPayload)
          await inviteRef.set({ twilioSid: sms.sid, smsStatus: sms.status }, { merge: true })
          results.push({ phone, success: true, sid: sms.sid })
        } catch (error) {
          results.push({ phone, success: false, error: error.message })
        }
      }

      return res.json({
        success: true,
        sent: results.filter(item => item.success).length,
        total: results.length,
        results
      })
    } catch (error) {
      console.error("Erreur invitation demande client :", error)
      return res.status(error.statusCode || 500).json({ success: false, error: error.message })
    }
  })
})

exports.sendShipmentSMS = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Méthode non autorisée" })
      }

      const decodedToken = await verifyRequestUser(req)
      const userData = await getUserData(decodedToken.uid)
      const entrepriseId = userData?.entrepriseId
      const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : []

      if (!entrepriseId || !recipients.length || recipients.length > 100) {
        return res.status(400).json({ success: false, error: "Destinataires invalides" })
      }

      const results = []
      const client = getTwilioClient()

      for (const recipient of recipients) {
        try {
          const shipmentId = String(recipient.enlevementId || "")
          const shipmentSnap = await db.collection("enlevements").doc(shipmentId).get()
          if (!shipmentSnap.exists || shipmentSnap.data().entrepriseId !== entrepriseId) {
            throw new Error("Colis inaccessible")
          }

          const shipment = shipmentSnap.data()
          const phone = normalizePhone(shipment.telephoneExpediteur)
          if (!phone) throw new Error("Téléphone expéditeur invalide")

          const body = buildMessage(req.body?.customMessage, {
            expediteur: shipment.expediteur,
            destinataire: shipment.destinataire,
            client: shipment.expediteur,
            telephone: phone,
            numero: recipient.numero || shipment.numero,
            destination: shipment.destination,
            statut: recipient.statut || shipment.deliveryStatus,
            entreprise: req.body?.entreprise || "Paris Fret Transport"
          })

          if (!body.trim()) throw new Error("Message vide")
          const payload = buildSmsPayload(body, phone)

          const sms = await client.messages.create(payload)
          results.push({ enlevementId: shipmentId, phone, success: true, sid: sms.sid, status: sms.status })
        } catch (error) {
          results.push({ enlevementId: recipient.enlevementId || "", success: false, error: error.message })
        }
      }

      return res.json({ success: true, sent: results.filter(item => item.success).length, total: results.length, results })
    } catch (error) {
      console.error("Erreur SMS colis :", error)
      return res.status(error.statusCode || 500).json({ success: false, error: error.message })
    }
  })
})

exports.clientRequestForm = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const token = String(req.method === "GET" ? req.query.token : req.body?.token || "")
      if (!/^[a-f0-9]{48}$/.test(token)) {
        return res.status(400).json({ success: false, error: "Lien invalide" })
      }

      const inviteRef = db.collection("clientRequestInvites").doc(token)
      const inviteSnap = await inviteRef.get()
      if (!inviteSnap.exists) return res.status(404).json({ success: false, error: "Lien introuvable" })

      const invite = inviteSnap.data()
      if (invite.expiresAt?.toMillis() < Date.now()) {
        return res.status(410).json({ success: false, error: "Ce lien a expiré" })
      }

      if (req.method === "GET") {
        return res.json({
          success: true,
          invite: {
            name: invite.name,
            phone: invite.phone,
            address: invite.address,
            submitted: invite.status === "submitted"
          }
        })
      }

      if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Méthode non autorisée" })
      }

      if (invite.status === "submitted") {
        return res.status(409).json({ success: false, error: "Cette demande a déjà été envoyée" })
      }

      const input = req.body?.request || {}
      const requestedPackages = Array.isArray(input.colis)
        ? input.colis.slice(0, 30).map(item => ({
          nom: String(item?.nom || "").trim().slice(0, 160),
          quantite: Math.max(1, Math.min(999, Number(item?.quantite || 1)))
        })).filter(item => item.nom)
        : []
      const requestData = {
        entrepriseId: invite.entrepriseId,
        inviteToken: token,
        clientNom: String(input.expediteur || input.clientNom || invite.name || "").trim().slice(0, 120),
        clientTelephone: normalizePhone(input.telephoneExpediteur || input.clientTelephone || invite.phone),
        adresseEnlevement: String(input.adresseEnlevement || invite.address || "").trim().slice(0, 300),
        destinataire: String(input.destinataire || "").trim().slice(0, 120),
        telephoneDestinataire: normalizePhone(input.telephoneDestinataire),
        destination: "Cameroun",
        typeDeFret: input.typeDeFret === "Aérien" ? "Aérien" : "Maritime",
        personneEnCharge: input.typeDeFret === "Aérien"
          ? String(input.personneEnCharge || "").trim().slice(0, 120)
          : "",
        telephoneAgent: input.typeDeFret === "Aérien"
          ? normalizePhone(input.telephoneAgent)
          : "",
        poidsTotal: input.typeDeFret === "Aérien"
          ? Math.max(0, Number(input.poidsTotal || 0))
          : 0,
        colis: requestedPackages,
        descriptionColis: requestedPackages.map(item => item.quantite + " × " + item.nom).join(", ").slice(0, 500),
        nombreDeColis: requestedPackages.reduce((total, item) => total + item.quantite, 0),
        notes: String(input.notes || "").trim().slice(0, 1000),
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }

      if (!requestData.clientNom || !requestData.clientTelephone || !requestData.adresseEnlevement
        || !requestData.destinataire || !requestData.telephoneDestinataire || !requestData.colis.length) {
        return res.status(400).json({ success: false, error: "Veuillez remplir les champs obligatoires" })
      }

      const requestRef = db.collection("clientRequests").doc()
      await db.runTransaction(async transaction => {
        const freshInvite = await transaction.get(inviteRef)
        if (freshInvite.data()?.status === "submitted") throw new Error("Demande déjà envoyée")
        transaction.set(requestRef, requestData)
        transaction.update(inviteRef, {
          status: "submitted",
          requestId: requestRef.id,
          submittedAt: admin.firestore.FieldValue.serverTimestamp()
        })
      })

      return res.json({ success: true, requestId: requestRef.id })
    } catch (error) {
      console.error("Erreur formulaire client :", error)
      return res.status(500).json({ success: false, error: error.message || "Erreur interne" })
    }
  })
})

async function deleteCollectionByEntreprise(collectionName, entrepriseId) {
  const snapshot = await db
    .collection(collectionName)
    .where("entrepriseId", "==", entrepriseId)
    .get()

  if (snapshot.empty) return 0

  let batch = db.batch()
  let count = 0
  let deleted = 0

  for (const document of snapshot.docs) {
    batch.delete(document.ref)
    count++
    deleted++

    if (count === 450) {
      await batch.commit()
      batch = db.batch()
      count = 0
    }
  }

  if (count > 0) {
    await batch.commit()
  }

  return deleted
}

exports.deleteEntreprise = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({
          success: false,
          error: "Méthode non autorisée"
        })
      }

      const decodedToken = await verifyRequestUser(req)
      const { entrepriseId } = req.body || {}

      if (!entrepriseId) {
        return res.status(400).json({
          success: false,
          error: "Entreprise ID manquant"
        })
      }

      const entrepriseRef = db.collection("entreprises").doc(entrepriseId)
      const entrepriseSnap = await entrepriseRef.get()

      if (!entrepriseSnap.exists) {
        return res.status(404).json({
          success: false,
          error: "Entreprise introuvable"
        })
      }

      const userSnap = await db.collection("users").doc(decodedToken.uid).get()
      const userData = userSnap.exists ? userSnap.data() : null

      const isOwner = entrepriseSnap.data().createdBy === decodedToken.uid
      const isCompanyAdmin =
        userData?.entrepriseId === entrepriseId &&
        String(userData?.role || "").toLowerCase() === "admin"
      const isSuperAdmin = hasSuperAdminRole(userData, decodedToken)

      if (!isOwner && !isCompanyAdmin && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          error: "Accès refusé"
        })
      }

      const collectionsToDelete = [
        "customers",
        "enlevements",
        "chargements",
        "destinations",
        "messages",
        "invitations",
        "colis",
        "boxes",
        "tasks",
        "dailyTasks",
        "events",
        "payments",
        "company"
      ]

      const results = {}

      for (const collectionName of collectionsToDelete) {
        results[collectionName] = await deleteCollectionByEntreprise(
          collectionName,
          entrepriseId
        )
      }

      const usersSnapshot = await db
        .collection("users")
        .where("entrepriseId", "==", entrepriseId)
        .get()

      let deletedUsers = 0
      const authErrors = []

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data()
        const uid = userData.uid || userDoc.id

        try {
          await admin.auth().deleteUser(uid)
        } catch (error) {
          authErrors.push({
            uid,
            error: error.message
          })
        }

        await userDoc.ref.delete()
        deletedUsers++
      }

      results.users = deletedUsers

      try {
        const bucket = admin.storage().bucket()

        await bucket.deleteFiles({
          prefix: `entreprises/${entrepriseId}/`
        })
      } catch (storageError) {
        console.log("Storage vide ou erreur :", storageError.message)
      }

      await entrepriseRef.delete()

      return res.status(200).json({
        success: true,
        message: "Entreprise supprimée définitivement",
        results,
        authErrors
      })
    } catch (error) {
      console.error("Erreur suppression entreprise :", error)

      return res.status(500).json({
        success: false,
        error: "Erreur suppression entreprise",
        details: error.message
      })
    }
  })
})

exports.sendWhatsAppTemplateBroadcast = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({
          success: false,
          error: "Méthode non autorisée"
        })
      }

      const decodedToken = await verifyRequestUser(req)
      await validateCustomerBroadcast(decodedToken, req.body || {})

      const { recipients, customMessage, entreprise } = req.body || {}

      if (!Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Recipients manquant."
        })
      }

      const uniqueRecipients = [
        ...new Map(
          recipients
            .map(item => {
              const phone = normalizePhone(item.phone)
              if (!phone) return null

              return [
                phone,
                {
                  ...item,
                  phone
                }
              ]
            })
            .filter(Boolean)
        ).values()
      ]

      const results = []

      for (const recipient of uniqueRecipients) {
        try {
          const payload = customMessage
            ? {
                body: buildMessage(customMessage, {
                  expediteur: recipient.expediteur,
                  destinataire: recipient.destinataire,
                  prenom: recipient.prenom,
                  nom: recipient.nom,
                  client: recipient.client || recipient.destinataire || recipient.expediteur,
                  telephone: recipient.phone,
                  numero: recipient.numero,
                  destination: recipient.destination,
                  statut: recipient.statut,
                  entreprise
                }),
                from: `whatsapp:${whatsappSender}`,
                to: `whatsapp:${recipient.phone}`
              }
            : {
                messagingServiceSid,
                contentSid: colisStatutTemplateSid,
                from: `whatsapp:${whatsappSender}`,
                to: `whatsapp:${recipient.phone}`
              }

          const message = await getTwilioClient().messages.create(payload)

          results.push({
            phone: recipient.phone,
            success: true,
            sid: message.sid,
            status: message.status
          })
        } catch (error) {
          results.push({
            phone: recipient.phone,
            success: false,
            error: error.message,
            code: error.code,
            moreInfo: error.moreInfo
          })
        }
      }

      const sent = results.filter(item => item.success).length

      return res.status(200).json({
        success: true,
        sent,
        total: uniqueRecipients.length,
        results
      })
    } catch (error) {
      console.error("Erreur WhatsApp broadcast :", error)

      return res.status(error.statusCode || 500).json({
        success: false,
        error: error.statusCode ? error.message : "Erreur diffusion WhatsApp",
        details: error.message
      })
    }
  })
})
