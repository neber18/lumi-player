import { parseIsoDuration, parseVideoId } from "../src/youtube";
import { check, finish } from "./helpers";

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

check("live", parseVideoId(`https://www.youtube.com/live/${ID}`) === ID);
check("youtube-nocookie embed", parseVideoId(`https://www.youtube-nocookie.com/embed/${ID}`) === ID);
check("espacios alrededor se ignoran", parseVideoId(`  https://youtu.be/${ID}  `) === ID);
check("cadena vacía se rechaza", parseVideoId("") === null);
check("youtu.be sin id se rechaza", parseVideoId("https://youtu.be/") === null);
check("watch sin parámetro v se rechaza", parseVideoId("https://www.youtube.com/watch") === null);

check("duración PT3M45S", parseIsoDuration("PT3M45S") === 225);
check("duración PT1H2M3S", parseIsoDuration("PT1H2M3S") === 3723);
check("duración PT45S", parseIsoDuration("PT45S") === 45);
check("duración inválida", parseIsoDuration("P0D") === 0);
check("duración PT10M", parseIsoDuration("PT10M") === 600);
check("duración PT1H", parseIsoDuration("PT1H") === 3600);
check("duración vacía", parseIsoDuration("") === 0);

finish("Todas las pruebas de YouTube pasaron");
