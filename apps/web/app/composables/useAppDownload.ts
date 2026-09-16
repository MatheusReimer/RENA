import { BRAND } from '@revy/shared/constants'

/**
 * Whether this visitor should be offered the native app, and where from.
 *
 * The landing screen is the one page a phone user is expected to meet on the
 * web -- everything past sign-in is the app -- so its job on a small screen is
 * to hand them the app rather than walk them through a sign-up they will
 * immediately repeat. That only holds while there is an app to hand them:
 * `BRAND.stores` is null until each one is published, and until then a phone
 * visitor gets exactly what a desktop visitor gets.
 *
 * Resolved after mount, never during render. The server has no idea what
 * device it is answering, and rendering a guess would either hydrate into a
 * mismatch or ship a page that says "Download for iPhone" to somebody on a
 * desktop.
 */
export function useAppDownload() {
  const { t } = useI18n()

  const platform = ref<'ios' | 'android' | null>(null)

  onMounted(() => {
    const ua = navigator.userAgent

    /*
     * iPadOS reports itself as a Mac. The tell is the touch points: a real Mac
     * has none, an iPad claims five. Without this an iPad is offered the
     * desktop page, which is the one device most likely to actually want the
     * tablet app.
     */
    const isIpad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
    if (/iPhone|iPod/.test(ua) || isIpad) platform.value = 'ios'
    else if (/Android/.test(ua)) platform.value = 'android'
  })

  /** The store link for this device, or null when there is nothing to link to. */
  const href = computed(() => (platform.value ? BRAND.stores[platform.value] : null))

  /** True only when this device has an app AND that app has been published. */
  const available = computed(() => href.value !== null)

  const label = computed(() =>
    platform.value === 'ios' ? t('app.appStore') : t('app.googlePlay'),
  )

  return { platform, href, available, label }
}
