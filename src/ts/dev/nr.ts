import { mount, init } from "../main";

// Mirrors ^:dev/after-load on-reload in CLJS (hot module reload)
if ((module as any).hot) {
  (module as any).hot.accept(() => {
    mount();
  });
}

init();
