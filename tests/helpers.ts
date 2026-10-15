/** Utilidades mínimas compartidas por los archivos de prueba (sin dependencias). */

let failed = 0;

export function check(name: string, cond: boolean): void {
  if (!cond) failed++;
  console.log(`${cond ? "OK  " : "FAIL"} ${name}`);
}

/** Lanza un error si alguna comprobación falló; si no, imprime el mensaje final. */
export function finish(successMessage: string): void {
  if (failed) throw new Error(`${failed} prueba(s) fallaron`);
  console.log(`\n${successMessage}`);
}
