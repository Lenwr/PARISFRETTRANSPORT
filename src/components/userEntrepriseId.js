// composables/useEntrepriseId.js
import { ref, onMounted } from 'vue'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore'
import { PARIS_FRET_ENTREPRISE_ID } from '../appConfig'

export function useEntrepriseId() {
  const entrepriseId = ref(PARIS_FRET_ENTREPRISE_ID)
  const isLoading = ref(true)

  onMounted(() => {
    const auth = getAuth()
    const db = getFirestore()

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, 'users', user.uid)
        const userSnap = await getDoc(userRef)
        const profileEntrepriseId = userSnap.exists()
          ? userSnap.data()?.entrepriseId
          : ''

        if (profileEntrepriseId) {
          entrepriseId.value = profileEntrepriseId
          isLoading.value = false
          return
        }

        await setDoc(
          userRef,
          {
            email: user.email || '',
            entrepriseId: PARIS_FRET_ENTREPRISE_ID,
            role: userSnap.exists() ? userSnap.data()?.role || 'user' : 'user',
            isActive: userSnap.exists() ? userSnap.data()?.isActive !== false : true,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        )

        const entreprisesRef = collection(db, 'entreprises')

        // 1. Est-ce le créateur ?
        let q = query(entreprisesRef, where('createdBy', '==', user.uid))
        let querySnapshot = await getDocs(q)

        // 2. Sinon, est-ce un membre ?
        if (querySnapshot.empty) {
          q = query(entreprisesRef, where('users', 'array-contains', user.uid))
          querySnapshot = await getDocs(q)
        }

        if (!querySnapshot.empty) {
          entrepriseId.value = querySnapshot.docs[0].id
        } else {
          entrepriseId.value = PARIS_FRET_ENTREPRISE_ID
        }
      } else {
        entrepriseId.value = ''
      }

      isLoading.value = false
    })
  })

  return { entrepriseId, isLoading }
}
