/**
 * Convenção shadcn/ui: componentes do registry importam `cn` de "@/lib/utils".
 * Este projeto já tinha o helper em "@/lib/cn" — reexportamos daqui para que
 * qualquer componente colado do registry resolva sem editar o import.
 */
export { cn } from "./cn";
