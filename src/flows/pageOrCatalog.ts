import { addKeyword, EVENTS } from '@builderbot/bot';

const pageOrCatalog = addKeyword(EVENTS.ACTION)
.addAction({ capture: true },
    async (ctx, { fallBack, flowDynamic }) => {
        const techAuraP = 'https://techauraz.com'
        await flowDynamic(`Excelente elección, por favor indicame si deseas ver nuestros ${ctx.body} en la página web o en el catálogo de whatsapp.`)
    if (!["1", "2", "3"].includes(ctx.body) && !["pagina", "catalogo", "web"].includes(ctx.body)) {
    return fallBack(
    // "Respuesta no válida, por favor selecciona una de las opciones."
    );
    }
    switch (ctx.body) {
    case "1":
    case "pagina":
        return await flowDynamic(`Serás rediregido a la página de TechAura, por favor, haz clic sobre las letras azules ${ techAuraP }`)
    case "2":
    case "web":    
        return await flowDynamic(`Serás rediregido a la página de TechAura, por favor, haz clic sobre las letras azules ${ techAuraP }`)
    case "3":
    case "catalogo":
        return await flowDynamic(`Ahora verás nuestra catalogo con los productos disponibles, da clic sobre el siguiente enlace:
            \nhttps://wa.me/c/573008602789`)    
    case "0":
    return await flowDynamic(
    "Saliendo... Puedes volver a acceder a este menú escribiendo '*Menu"
    );
    }
    }
);

// module.exports = pageOrCa;
// createFlow([pageOrCa])
export default pageOrCatalog