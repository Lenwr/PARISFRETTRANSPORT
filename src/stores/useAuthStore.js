import { defineStore } from "pinia"
import { ref } from "vue"
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "firebase/auth"
import {
  getFirestore,
  setDoc,
  doc,
  getDoc,
  serverTimestamp
} from "firebase/firestore"
import { PARIS_FRET_ENTREPRISE_ID } from "../appConfig"
import { trackingSlug } from "../utils/publicTracking"

const PARIS_FRET_ENTREPRISE = {
  accountType: "professionnel",
  nom: "Paris Fret Transport",
  trackingSlug: trackingSlug("Paris Fret Transport"),
  companyName: "Paris Fret Transport",
  companyLegalName: "CAMER FRET ET SERVICES SARL",
  companyRegistrationNumber: "",
  vatNumber: "",
  email: "parisfrettransport@gmail.com",
  tel: "+33622281220",
  address: {
    number: "15",
    street: "Rue des Ecoles",
    postalCode: "95500",
    city: "Le Thillay",
    country: "France"
  },
  logoUrl: "/images/logo.png",
  isActive: true,
  features: {
    envois: true,
    planning: true,
    factures: true,
    outils: true,
    scanQr: true,
    sms: true,
    suiviPublic: true,
    exportExcel: true,
    employes: true,
    roles: true,
    branding: true,
    notificationsRetard: true,
    statistiques: true,
    destinationsPersonnalisees: true,
    tarifsDestination: true,
    documents: true,
    signatureLivraison: true,
    modeDepot: true,
    historiqueActions: true
  }
}

export const useAuthStore = defineStore("auth", () => {
  const email = ref("")
  const password = ref("")
  const entrepriseNom = ref("")
  const error = ref(null)
  const entreprise = ref(null)
  const userProfile = ref(null)
  const superAdmin = ref(false)
  const isLoading = ref(true)
  const isInitialized = ref(false)
  let initPromise = null

  const auth = getAuth()
  const db = getFirestore()

  const normalizeEmail = value => String(value || "").trim().toLowerCase()

  const hasSuperAdminRole = profile => {
    const role = String(profile?.role || "")
      .trim()
      .toLowerCase()
      .replace(/[_\s-]/g, "")

    return (
      role === "superadmin" ||
      profile?.isSuperAdmin === true ||
      profile?.superAdmin === true
    )
  }

  const ensureParisFretUserProfile = async user => {
    if (!user?.uid) return null

    const userRef = doc(db, "users", user.uid)
    const snap = await getDoc(userRef)
    const data = snap.exists() ? snap.data() : {}

    if (data?.entrepriseId) {
      return {
        id: user.uid,
        ...data
      }
    }

    const payload = {
      email: normalizeEmail(user.email),
      entrepriseId: PARIS_FRET_ENTREPRISE_ID,
      role: data?.role || "user",
      accountType: data?.accountType || "professionnel",
      isActive: data?.isActive !== false,
      updatedAt: serverTimestamp()
    }

    if (!snap.exists()) {
      payload.createdAt = serverTimestamp()
    }

    await setDoc(userRef, payload, { merge: true })

    return {
      id: user.uid,
      ...data,
      ...payload
    }
  }

  const handleAuthError = err => {
    switch (err.code) {
      case "auth/invalid-email":
        error.value = "Email invalide"
        break
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        error.value = "Email ou mot de passe incorrect"
        break
      case "auth/email-already-in-use":
        error.value = "Email déjà utilisé"
        break
      case "auth/weak-password":
        error.value = "Mot de passe trop faible"
        break
      default:
        error.value = err.message || "Une erreur est survenue"
    }
  }

  const login = async () => {
    error.value = null

    try {
      const normalizedEmail = normalizeEmail(email.value)

      const userCredential = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        password.value
      )

      await fetchEntreprise(userCredential.user.uid)
    } catch (err) {
      handleAuthError(err)
      throw err
    }
  }

  const init = () => {
    if (initPromise) return initPromise

    isLoading.value = true

    initPromise = new Promise(resolve => {
      const unsubscribe = onAuthStateChanged(auth, async user => {
        try {
          if (user) {
            await fetchUserProfile(user.uid)
            await fetchEntreprise(user.uid)
          } else {
            entreprise.value = null
            userProfile.value = null
          }
        } catch (err) {
          console.error("Erreur init auth:", err)
        } finally {
          isInitialized.value = true
          isLoading.value = false
          resolve()
          unsubscribe()
        }
      })
    })

    return initPromise
  }

  const fetchUserProfile = async userId => {
    try {
      const currentUser = auth.currentUser

      if (currentUser?.uid === userId) {
        await ensureParisFretUserProfile(currentUser)
      }

      const snap = await getDoc(doc(db, "users", userId))
      const token = await auth.currentUser?.getIdTokenResult()

      userProfile.value = snap.exists()
        ? {
            id: snap.id,
            ...snap.data()
          }
        : null

      superAdmin.value = Boolean(
        token?.claims?.superAdmin ||
        hasSuperAdminRole(userProfile.value)
      )
    } catch (err) {
      console.error("Erreur fetchUserProfile:", err)
      userProfile.value = null
      superAdmin.value = false
    }
  }

  const isSuperAdmin = async () => {
    const user = auth.currentUser
    if (!user) return false

    const token = await user.getIdTokenResult()

    superAdmin.value = Boolean(
      token.claims?.superAdmin ||
      hasSuperAdminRole(userProfile.value)
    )

    return superAdmin.value
  }

  const fetchEntreprise = async userId => {
    try {
      const currentUser = auth.currentUser

      if (currentUser?.uid === userId) {
        await ensureParisFretUserProfile(currentUser)
      }

      const snap = await getDoc(doc(db, "entreprises", PARIS_FRET_ENTREPRISE_ID))

      if (snap.exists()) {
        entreprise.value = {
          id: snap.id,
          ...snap.data()
        }
      } else {
        entreprise.value = {
          id: PARIS_FRET_ENTREPRISE_ID,
          ...PARIS_FRET_ENTREPRISE
        }
      }
    } catch (err) {
      console.error("Erreur fetchEntreprise:", err)
      entreprise.value = null
    }
  }

  const updateEntreprise = async updates => {
    if (!entreprise.value?.id) return

    const refEntreprise = doc(db, "entreprises", entreprise.value.id)
    const currentUser = auth.currentUser

    if (!currentUser) {
      throw new Error("Utilisateur non connecté")
    }

    await setDoc(refEntreprise, {
      ...updates,
      createdBy: currentUser.uid,
      updatedAt: serverTimestamp()
    }, { merge: true })

    entreprise.value = {
      ...entreprise.value,
      ...updates
    }
  }

  const logout = async () => {
    await signOut(auth)

    entreprise.value = null
    userProfile.value = null
    superAdmin.value = false
    email.value = ""
    password.value = ""
    entrepriseNom.value = ""
    error.value = null
  }

  const getCurrentUser = () => auth.currentUser

  return {
    email,
    password,
    entrepriseNom,
    error,
    entreprise,
    userProfile,
    superAdmin,
    isLoading,
    isInitialized,

    login,
    init,
    logout,
    fetchUserProfile,
    fetchEntreprise,
    updateEntreprise,
    getCurrentUser,
    isSuperAdmin
  }
})
