import { init } from "../main";

// Mirrors (set! *print-fn* (fn [& _])) - ignore println in prod
console.log = () => {};

init();
