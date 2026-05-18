type ToastrFn = (message: string, title?: string, options?: object) => void;

interface Toastr {
  options: object;
  success: ToastrFn;
  info: ToastrFn;
  warning: ToastrFn;
  error: ToastrFn;
  [key: string]: ToastrFn | object;
}

declare global {
  interface Window {
    toastr: Toastr;
  }
}

export {};
