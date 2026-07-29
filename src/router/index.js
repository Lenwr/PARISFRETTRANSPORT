import { createRouter, createWebHashHistory } from "vue-router";
import { getAuth } from "firebase/auth";
import { toast } from "vue3-toastify";
import { useAuthStore } from "../stores/useAuthStore.js";

const DashboardLayout = () => import("../layout/DashboardLayout.vue")
const HomeView = () => import("../views/HomeView.vue")
const LoginFormView = () => import("../views/authentication/loginFormView.vue")
const Form = () => import("../views/liste/form.vue")
const ListeView = () => import("../views/liste/listeView.vue")
const ListeDetailsView = () => import("../views/liste/listeDetailsView.vue")
const QrCodeView = () => import("../views/planingCalendarView.vue")
const SoumissionFormulaire = () => import("../views/authentication/soumissionFormulaire.vue")
const Scan = () => import("../views/scan.vue")
const PlaningCalendarView = () => import("../views/planingCalendarView.vue")
const CustomersView = () => import("../views/customers/customersView.vue")
const CustomersFormView = () => import("../views/customers/customersFormView.vue")
const CustomersDetailsView = () => import("../views/customers/customersDetailsView.vue")
const CustomersBroadcastView = () => import("../views/customers/CustomersBroadcastView.vue")
const SelectCustomersView = () => import("../views/customers/selectCustomersView.vue")
const LoadingPackagesRecording = () => import("../views/chargements/loadingPackagesRecording.vue")
const ChargementsDetails = () => import("../views/chargements/chargementsDetails.vue")
const GeneratorBarCode = () => import("../components/GeneratorBarCode.vue")
const SignaturePad = () => import("../views/signaturePad.vue")
const ToolsView = () => import("../views/calculator.vue")
const VolumeCalculator = () => import("../views/volumeCalculator.vue")
const InvoicesQuotesView = () => import("../views/factures/InvoicesQuotesView.vue")
const Parametres = () => import("../views/parametres.vue")
const VoyageScanView = () => import("../views/voyages/VoyageScanView.vue")
const CatalogueView = () => import("../views/catalogue/CatalogueView.vue")
const ClientFollowUpView = () => import("../views/customers/ClientFollowUpView.vue")
const ClientRequestsView = () => import("../views/requests/ClientRequestsView.vue")
const PublicClientRequestView = () => import("../views/requests/PublicClientRequestView.vue")
const ClientRequestThankYouView = () => import("../views/requests/ClientRequestThankYouView.vue")
const DeliveryScanView = () => import("../views/deliveries/DeliveryScanView.vue")

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: LoginFormView,
    },
    {
      path: "/demande/:token?",
      component: PublicClientRequestView,
    },
    {
      path: "/merci",
      name: "request-thank-you",
      component: ClientRequestThankYouView,
    },
    {
      path: "/voyage/:id/scan",
      component: VoyageScanView,
      meta: { authNeeded: true },
    },
    {
      path: "/",
      meta: { authNeeded: true },
      component: DashboardLayout,
      children: [
        { path: "", name: "home", component: HomeView },
        { path: "form", component: Form },
        { path: "liste", component: ListeView, meta: { authNeeded: true } },
        { path: "catalogue", component: CatalogueView, meta: { authNeeded: true } },
        { path: "suivi-clients", component: ClientFollowUpView, meta: { authNeeded: true } },
        { path: "demandes", component: ClientRequestsView, meta: { authNeeded: true } },
        {
          path: "liste/:id",
          component: ListeDetailsView,
          meta: { authNeeded: true },
        },
        { path: "qrcode", component: QrCodeView, meta: { authNeeded: true, superAdminOnly: true } },
        {
          path: "soumission",
          component: SoumissionFormulaire,
          meta: { authNeeded: true },
        },
        { path: "scan", component: Scan, meta: { authNeeded: true } },
        { path: "livraisons/scan", component: DeliveryScanView, meta: { authNeeded: true } },
        {
          path: "planing",
          component: PlaningCalendarView,
          meta: { authNeeded: true, superAdminOnly: true },
        },
        { path: "customers", component: CustomersView, meta: { authNeeded: true } },
        { path: "customers/broadcast", component: CustomersBroadcastView, meta: { authNeeded: true } },
        { path: "customersForm", component: CustomersFormView, meta: { authNeeded: true } },
        { path: "customersDetails/:id", component: CustomersDetailsView, meta: { authNeeded: true } },
        {
          path: "selectForm",
          component: SelectCustomersView,
          meta: { authNeeded: true },
        },
        {
          path: "recording",
          component: LoadingPackagesRecording,
          meta: { authNeeded: true },
        },
        {
          path: "chargementsDetails/:id",
          component: ChargementsDetails,
          meta: { authNeeded: true },
        },
        {
          path: "BarCode",
          component: GeneratorBarCode,
          meta: { authNeeded: true },
        },
        {
          path: "settings",
          component: Parametres,
          meta: { authNeeded: true },
        },
        {
          path: "sign/:id",
          component: SignaturePad,
          meta: { authNeeded: true },
        },
        {
          path: "calculator",
          redirect: "/tools/volume",
          meta: { authNeeded: true },
        },
        {
          path: "tools",
          component: ToolsView,
          meta: { authNeeded: true },
        },
        {
          path: "tools/volume",
          component: VolumeCalculator,
          meta: { authNeeded: true },
        },
        {
          path: "factures",
          component: InvoicesQuotesView,
          meta: { authNeeded: true },
        },
      ],
    },
  ],
});


// ✅ Auth Guard

router.beforeEach(async (to, from, next) => {
  const store = useAuthStore()

  if (!store.isInitialized) {
    await store.init()
  }

  const user = getAuth().currentUser

  if (to.meta.authNeeded && !user) {
    toast("Vous n'avez pas accès à cette page", {
      theme: "auto",
      type: "warning",
      autoClose: 1000,
    })
    return next("/login")
  }

  if (to.meta.authNeeded && !store.entreprise) {
    await store.fetchEntreprise(user.uid)
  }

  if (to.meta.superAdminOnly) {
    await store.fetchUserProfile(user.uid)
    const allowed = await store.isSuperAdmin()

    if (!allowed) {
      toast("Accès réservé aux super administrateurs", {
        theme: "auto",
        type: "warning",
        autoClose: 1500,
      })
      return next("/")
    }
  }

  next()
})
export default router
