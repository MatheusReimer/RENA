import { blockReason, isFieldLevel, type BlockReason } from '@revy/shared/utils'
import { defineStore } from 'pinia'
import { ApiError } from '~/composables/useApi'

/**
 * The one place the product says "that did not work, and here is why".
 *
 * Before this, an action that the server refused simply stopped: the button's
 * spinner ended, nothing on screen changed, and nothing was said. Eighteen
 * call sites across nine screens were written as `try { ... } finally { ... }`
 * with no catch at all, so every gated action in the product failed in
 * silence -- pressing "Add friend" without a confirmed address being the one
 * that prompted this.
 *
 * Deliberately a store rather than per-screen state. A refusal can be raised
 * from a page, a dialog or a card, and all of them need the same surface; and
 * the surface has to outlive the component when the failure is followed by a
 * navigation.
 */
export interface Notice {
  id: number
  /** Already translated: the store holds text, the caller holds the i18n. */
  message: string
  action?: { label: string; to: string }
  tone: 'blocked' | 'done'
}

let nextId = 0

export const useNoticeStore = defineStore('notice', () => {
  const current = ref<Notice | null>(null)

  let timer: ReturnType<typeof setTimeout> | undefined

  /**
   * Shown until dismissed when there is something to do about it.
   *
   * A notice that offers a button has to outlast a glance -- taking it away on
   * a timer means the reader watches the explanation for their own failure
   * disappear before they have finished reading it. Notices with no action are
   * acknowledgements and can leave on their own.
   */
  function show(notice: Omit<Notice, 'id'>): void {
    clearTimeout(timer)
    current.value = { ...notice, id: ++nextId }
    if (!notice.action) timer = setTimeout(dismiss, 6000)
  }

  function dismiss(): void {
    clearTimeout(timer)
    current.value = null
  }

  return { current, show, dismiss }
})

/**
 * Raises the right notice for a failed request.
 *
 * A composable rather than a store method because it needs `t`, and the store
 * must not hold an i18n instance -- it outlives the component tree and would
 * go stale the moment somebody switched language.
 *
 * Returns the reason it used, so a caller that wants to do something extra
 * (focus a field, roll back an optimistic update) can branch on it.
 */
export function useNotice() {
  const store = useNoticeStore()
  const { t } = useI18n()

  /**
   * Field-level failures are handed back rather than shown.
   *
   * "That username is taken" belongs against the username box, not in the
   * corner of the screen, and the forms already render `error.fields`. This
   * returns null for those so a caller can tell the difference between "I have
   * reported this" and "this one is yours".
   */
  function fromError(error: unknown): BlockReason | null {
    const code = error instanceof ApiError ? error.code : undefined
    if (code && isFieldLevel(code)) return null

    const reason = blockReason(code)
    store.show({
      message: t(reason.messageKey),
      tone: 'blocked',
      action:
        reason.actionKey && reason.to
          ? { label: t(reason.actionKey), to: reason.to }
          : undefined,
    })
    return reason
  }

  /** A plain confirmation, for actions worth acknowledging. */
  function say(message: string): void {
    store.show({ message, tone: 'done' })
  }

  return { fromError, say, dismiss: store.dismiss, current: computed(() => store.current) }
}
