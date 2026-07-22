// stores/customers.js
import { defineStore } from 'pinia'
import { db } from '../../components/firebaseConfig.js'
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where
} from 'firebase/firestore'

export const useCustomersStore = defineStore('customers', {
  state: () => ({
    customers: [],
    currentCustomer: null,
    loading: false,
    error: null
  }),

  actions: {
    // ✅ CREATE (avec entrepriseId)
    async createCustomers(data) {
      this.loading = true
      try {
        if (!data.entrepriseId) {
          throw new Error('entrepriseId manquant pour la création')
        }

        const docRef = await addDoc(collection(db, 'customers'), {
          ...data,
          createdAt: new Date()
        })

        const newCustomer = { id: docRef.id, ...data }
        this.customers.push(newCustomer)
        return newCustomer
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // ✅ READ (filtré par entrepriseId)
    async fetchCustomers(entrepriseId) {
      this.loading = true
      try {
        if (!entrepriseId) {
          throw new Error('entrepriseId requis pour récupérer les clients')
        }

        const q = query(
          collection(db, 'customers'),
          where('entrepriseId', '==', entrepriseId)
        )

        const querySnapshot = await getDocs(q)

        this.customers = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // READ one
    async fetchCustomer(id) {
      this.loading = true
      try {
        const docRef = doc(db, 'customers', id)
        const docSnap = await getDoc(docRef)

        if (docSnap.exists()) {
          this.currentCustomer = {
            id: docSnap.id,
            ...docSnap.data()
          }
          return this.currentCustomer
        } else {
          throw new Error('Client non trouvé')
        }
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // UPDATE
    async updateCustomers(id, updates) {
      this.loading = true
      try {
        const docRef = doc(db, 'customers', id)
        await updateDoc(docRef, updates)

        const index = this.customers.findIndex(e => e.id === id)
        if (index !== -1) {
          this.customers[index] = {
            ...this.customers[index],
            ...updates
          }
        }
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    },

    // DELETE
    async deleteCustomer(id) {
      this.loading = true
      try {
        await deleteDoc(doc(db, 'customers', id))
        this.customers = this.customers.filter(e => e.id !== id)
      } catch (error) {
        this.error = error.message
        throw error
      } finally {
        this.loading = false
      }
    }
  }
})
