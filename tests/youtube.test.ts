import { parseIsoDuration, parseVideoId } from "../src/youtube";

let failed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) failed++;
  console.log(`${cond ? "OK  " : "FAIL"} ${name}`);
}

const ID = "dQw4w9WgXcQ";
check("id suelto", parseVideoId(ID) === ID);
check("watch?v=", parseVideoId(`https://www.youtube.com/watch?v=${ID}&t=42s`) === ID);
check("youtu.be", parseVideoId(`https://youtu.be/${ID}?si=abc`) === ID);
check("música móvil", parseVideoId(`https://m.youtube.com/watch?v=${ID}`) === ID);
check("music.youtube.com", parseVideoId(`https://music.youtube.com/watch?v=${ID}`) === ID);
check("shorts", parseVideoId(`https://www.youtube.com/shorts/${ID}`) === ID);
check("embed", parseVideoId(`https://www.youtube.com/embed/${ID}`) === ID);
check("sin https", parseVideoId(`youtube.com/watch?v=${ID}`) === ID);
check("texto de búsqueda no es enlace", parseVideoId("bad bunny monaco") === null);
check("otro sitio se rechaza", parseVideoId(`https://example.com/watch?v=${ID}`) === null);
check("id inválido se rechaza", parseVideoId("https://www.youtube.com/watch?v=corto") === null);

check("duración PT3M45S", parseIsoDuration("PT3M45S") === 225);
check("duración PT1H2M3S", parseIsoDuration("PT1H2M3S") === 3723);
check("duración PT45S", parseIsoDuration("PT45S") === 45);
check("duración inválida", parseIsoDuration("P0D") === 0);

if (failed) throw new Error(`${failed} prueba(s) fallaron`);
console.log("\nTodas las pruebas de YouTube pasaron");
