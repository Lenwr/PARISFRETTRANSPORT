const test = require("node:test")
const assert = require("node:assert/strict")
const { buildPayload, trackingStatus } = require("./tracking")

test("convertit les anciens libellés en codes API", () => {
  assert.equal(trackingStatus("En attente"), "PENDING")
  assert.equal(trackingStatus("Attribué au vol"), "LOADED")
  assert.equal(trackingStatus("Envoyé"), "IN_TRANSIT")
  assert.equal(trackingStatus("Livré"), "DELIVERED")
})

test("produit uniquement le contrat public et retient le colis le moins avancé", () => {
  const payload = buildPayload({
    numero: "COL-123",
    deliveryStatus: "Livré",
    destination: "Douala",
    typeDeFret: "Aérien",
    expediteur: "Alice",
    telephoneExpediteur: "+33123456789",
    destinataire: "Bob",
    prix: 400,
    resteAPayer: 100,
    modeDePaiement: "CB",
    date: "2026-07-31T10:00:00.000Z",
    colis: [{
      nom: "Carton",
      quantite: 2,
      poidsTotal: 18,
      details: [{ statutColis: "En transit" }, { statutColis: "Réceptionné" }]
    }]
  }, { nom: "Paris Fret" })

  assert.equal(payload.shipment.status, "RECEIVED")
  assert.equal(payload.shipment.transportMode, "AIR")
  assert.equal(payload.packages[0].status, "RECEIVED")
  assert.equal(payload.packages[0].quantity, 2)
  assert.equal(payload.packages[0].description, "Carton")
  assert.equal(payload.sender.name, "Alice")
  assert.equal(payload.recipient.city, "Douala")
  assert.equal(JSON.stringify(payload).includes("+33123456789"), false)
  assert.equal(JSON.stringify(payload).includes("400"), false)
  assert.equal(Object.hasOwn(payload, "prix"), false)
})
