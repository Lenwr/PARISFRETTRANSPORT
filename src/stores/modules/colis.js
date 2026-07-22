import { defineStore } from 'pinia'
import { db } from '../../components/firebaseConfig.js'
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore'
import { syncPublicTracking } from '../../utils/publicTracking.js'

function generateNumero() {
  return `COL-${Date.now()}`
}

export const useEnlevementStore = defineStore('enlevements', {
  state: () => ({
    enlevements: [],
    currentEnlevement: null,
    loading: false,
    error: null,
    filters: {
      date: null,
      search: ''
    }
  }),

  getters: {
    filteredEnlevements: (state) => {
      let result = [...state.enlevements]

      if (state.filters.search) {
        const searchLower = state.filters.search.toLowerCase()

        result = result.filter(e =>
          e.nomExpediteur?.toLowerCase().includes(searchLower) ||
          e.nomDestinataire?.toLowerCase().includes(searchLower)
        )
      }

      if (state.filters.date) {
        result = result.filter(e =>
          new Date(e.date).toDateString() === new Date(state.filters.date).toDateString()
        )
      }

      return result
    },

    totalEnlevements: (state) => {
      return state.enlevements.length
    },

    enlevementsDuJour: (state) => {
      const today = new Date().toDateString()

      return state.enlevements.filter(e =>
        e.date && new Date(e.date).toDateString() === today
      ).length
    }
  },

  actions: {
    async fetchEnlevements(entrepriseId) {
      this.loading = true
      this.error = null

      try {
        if (!entrepriseId) {
          throw new Error('entrepriseId requis pour récupérer les enlèvements')
        }

        const q = query(
          collection(db, 'enlevements'),
          where('entrepriseId', '==', entrepriseId)
        )

        const querySnapshot = await getDocs(q)

        this.enlevements = querySnapshot.docs.map(document => ({
          id: document.id,
          ...document.data()
        }))
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async addEnlevement(enlevementData) {
      this.loading = true
      this.error = null

      try {
        if (!enlevementData.entrepriseId) {
          throw new Error('entrepriseId manquant pour créer un enlèvement')
        }

        const payload = {
          ...enlevementData,
          numero: enlevementData.numero || generateNumero(),
          createdAt: serverTimestamp()
        }

        const docRef = await addDoc(collection(db, 'enlevements'), payload)

        const newEnlevement = {
          id: docRef.id,
          ...payload,
          createdAt: new Date()
        }

        await syncPublicTracking(db, newEnlevement, {}, docRef.id)

        this.enlevements.push(newEnlevement)

        return docRef.id
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async updateEnlevement(id, updates, entrepriseId) {
      this.loading = true
      this.error = null

      try {
        if (!entrepriseId) {
          throw new Error('entrepriseId requis pour modifier un enlèvement')
        }

        const existing = this.enlevements.find(e => e.id === id)

        if (!existing || existing.entrepriseId !== entrepriseId) {
          throw new Error('Accès refusé à cet enlèvement')
        }

        const docRef = doc(db, 'enlevements', id)

        await updateDoc(docRef, {
          ...updates,
          entrepriseId,
          updatedAt: serverTimestamp()
        })

        const index = this.enlevements.findIndex(e => e.id === id)

        if (index !== -1) {
          this.enlevements[index] = {
            ...this.enlevements[index],
            ...updates,
            entrepriseId,
            updatedAt: new Date()
          }
        }
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    async deleteEnlevement(id, entrepriseId) {
      this.loading = true
      this.error = null

      try {
        if (!entrepriseId) {
          throw new Error('entrepriseId requis pour supprimer un enlèvement')
        }

        const existing = this.enlevements.find(e => e.id === id)

        if (!existing || existing.entrepriseId !== entrepriseId) {
          throw new Error('Accès refusé à cet enlèvement')
        }

        await deleteDoc(doc(db, 'enlevements', id))

        this.enlevements = this.enlevements.filter(e => e.id !== id)
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    setSearchFilter(search) {
      this.filters.search = search
    },

    setDateFilter(date) {
      this.filters.date = date
    },

    clearFilters() {
      this.filters.search = ''
      this.filters.date = null
    },

    clearCurrentEnlevement() {
      this.currentEnlevement = null
    }
  }
})
