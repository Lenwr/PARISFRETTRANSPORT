import { h } from "vue"
import { toast } from "vue3-toastify"

const baseOptions = {
  position: "top-right",
  theme: "light",
  autoClose: 2200
}

export function notify(message, type = "info", options = {}) {
  return toast(message, {
    ...baseOptions,
    type,
    ...options
  })
}

export function confirmToast({
  title = "Confirmation",
  message,
  confirmText = "Oui",
  cancelText = "Non",
  danger = false
} = {}) {
  return new Promise(resolve => {
    let settled = false

    const finish = (answer, closeToast) => {
      if (settled) return
      settled = true
      closeToast?.()
      resolve(answer)
    }

    toast(
      ({ closeToast }) =>
        h("div", { class: "pft-confirm-toast" }, [
          h("p", { class: "pft-confirm-toast__title" }, title),
          h("p", { class: "pft-confirm-toast__message" }, message || "Voulez-vous continuer ?"),
          h("div", { class: "pft-confirm-toast__actions" }, [
            h(
              "button",
              {
                type: "button",
                class: "pft-confirm-toast__button pft-confirm-toast__button--cancel",
                onClick: () => finish(false, closeToast)
              },
              cancelText
            ),
            h(
              "button",
              {
                type: "button",
                class: [
                  "pft-confirm-toast__button",
                  danger
                    ? "pft-confirm-toast__button--danger"
                    : "pft-confirm-toast__button--confirm"
                ],
                onClick: () => finish(true, closeToast)
              },
              confirmText
            )
          ])
        ]),
      {
        ...baseOptions,
        type: danger ? "warning" : "info",
        autoClose: false,
        closeOnClick: false,
        draggable: false,
        icon: false,
        closeButton: false,
        onClose: () => finish(false)
      }
    )
  })
}
