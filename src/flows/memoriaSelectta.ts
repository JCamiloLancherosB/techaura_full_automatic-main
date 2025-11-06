import { addKeyword } from '@builderbot/bot';

// Base de datos de categorías y sus opciones
const categories = {
    music: {
        name: "🎶 USB con Música",
        description: "Explora nuestra selección musical con géneros como salsa, rock, reggaetón, clásica, y más.",
        nextStep: "Selecciona tus géneros favoritos para crear tu USB personalizada.",
    },
    movies: {
        name: "🎥 USB con Películas y Series",
        description: "Disfruta de películas y series organizadas por géneros como acción, comedia, drama, animación, y más.",
        nextStep: "Selecciona el género o tipo de contenido que deseas incluir.",
    },
    kids: {
        name: "🧸 Contenido Infantil",
        description: "Contenido educativo y divertido para los más pequeños, incluyendo caricaturas, cuentos y canciones.",
        nextStep: "Selecciona el tipo de contenido infantil que prefieres.",
    },
    videos: {
        name: "📹 USB con Videos Personalizados",
        description: "Guarda tus momentos especiales en un USB personalizado con tus eventos y recuerdos.",
        nextStep: "Indícanos el tipo de videos que deseas incluir.",
    },
    promos: {
        name: "🛍️ Promociones Exclusivas",
        description: "Aprovecha nuestras ofertas especiales en USBs con contenido variado.",
        nextStep: "Consulta las promociones disponibles y elige la que más te convenga.",
    },
};

// Función para normalizar texto (eliminar tildes, convertir a minúsculas)
function normalizeText(text) {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

// Flujo principal
const memorySelect = addKeyword(['Saludos. Me encuentro interesad@ en la memoria USB.'])
    .addAnswer(
        `✨🙌 ¡Hola! Bienvenido(a) a *MemoriaSelecta*, donde personalizamos tus USBs con el contenido que más amas. Soy *Naomi*, tu asistente personal. 😊`,
        { delay: 1500 }
    )
    .addAnswer(
        `Por favor, selecciona una de las siguientes opciones para continuar: 👇\n\n` +
        Object.values(categories)
            .map((category, index) => `${index + 1}. ${category.name} - ${category.description}`)
            .join("\n"),
        { delay: 2000, capture: true },
        async (ctx, { flowDynamic, gotoFlow }) => {
            const userInput = ctx.body.trim();
            const choice = parseInt(userInput, 10);

            if (!isNaN(choice) && choice >= 1 && choice <= Object.keys(categories).length) {
                const selectedCategory = Object.values(categories)[choice - 1];

                await flowDynamic([
                    `✅ *¡Excelente elección!* Has seleccionado: *${selectedCategory.name}*`,
                    selectedCategory.nextStep,
                ]);

                // Redirigir al flujo correspondiente según la categoría seleccionada
                switch (selectedCategory.name) {
                    case "🎶 USB con Música":
                        return gotoFlow(musicFlow);
                    case "🎥 USB con Películas y Series":
                        return gotoFlow(moviesFlow);
                    case "🧸 Contenido Infantil":
                        return gotoFlow(kidsFlow);
                    case "📹 USB con Videos Personalizados":
                        return gotoFlow(videosFlow);
                    case "🛍️ Promociones Exclusivas":
                        return gotoFlow(promosFlow);
                    default:
                        return;
                }
            } else {
                await flowDynamic([
                    "❌ No entendí tu respuesta. Por favor, selecciona una opción válida (1-5)."
                ]);
            }
        }
    );

// Flujo para música
const musicFlow = addKeyword(['música', 'musica'])
    .addAnswer(
        `🎶 ¡Bienvenido al mundo de la música! Por favor, indícanos tus géneros favoritos para personalizar tu USB. 📝\n\n` +
        `Ejemplo: "Salsa, Rock, Pop".`,
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow }) => {
            const userGenres = normalizeText(ctx.body).split(",").map(genre => genre.trim());
            await flowDynamic([
                `✅ Has seleccionado los siguientes géneros: ${userGenres.join(", ")}.`,
                "🎧 Estamos preparando tu USB personalizada con las mejores canciones de esos géneros.",
            ]);
            return gotoFlow(finalStepFlow);
        }
    );

// Flujo para películas y series
const moviesFlow = addKeyword(['películas', 'series'])
    .addAnswer(
        `🎥 ¡Gran elección! Por favor, indícanos el género de películas o series que deseas incluir en tu USB. 📝\n\n` +
        `Ejemplo: "Acción, Comedia, Drama".`,
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow }) => {
            const userGenres = normalizeText(ctx.body).split(",").map(genre => genre.trim());
            await flowDynamic([
                `✅ Has seleccionado los siguientes géneros: ${userGenres.join(", ")}.`,
                "🎬 Estamos preparando tu USB personalizada con el mejor contenido de esos géneros.",
            ]);
            return gotoFlow(finalStepFlow);
        }
    );

// Flujo para contenido infantil
const kidsFlow = addKeyword(['infantil', 'niños', 'caricaturas'])
    .addAnswer(
        `🧸 ¡Qué lindo! Por favor, indícanos el tipo de contenido infantil que deseas incluir: caricaturas, cuentos, canciones, o todo el paquete. 📝`,
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow }) => {
            const userChoice = normalizeText(ctx.body);
            await flowDynamic([
                `✅ Has seleccionado: ${userChoice}.`,
                "🎉 Estamos preparando tu USB personalizada con contenido especial para los más pequeños.",
            ]);
            return gotoFlow(finalStepFlow);
        }
    );

// Flujo para videos personalizados
const videosFlow = addKeyword(['videos', 'personalizados'])
    .addAnswer(
        `📹 ¡Perfecto! Por favor, describe el tipo de videos que deseas incluir en tu USB (eventos, recuerdos, etc.). 📝`,
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow }) => {
            const userDescription = ctx.body.trim();
            await flowDynamic([
                `✅ Has solicitado videos personalizados con la descripción: "${userDescription}".`,
                "🎥 Estamos procesando tu solicitud.",
            ]);
            return gotoFlow(finalStepFlow);
        }
    );

// Flujo para promociones
const promosFlow = addKeyword(['promociones', 'ofertas'])
    .addAnswer(
        `🛍️ Estas son nuestras promociones actuales:\n\n` +
        `1. 🎁 USB 32GB con contenido mixto por $130mil.\n` +
        `2. 🎥 USB 64GB con películas y series por $170mil.\n` +
        `3. 🎶 USB personalizada con música por $150mil.\n\n` +
        `Por favor, selecciona el número de la promoción que deseas.`,
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow }) => {
            const promoChoice = ctx.body.trim();
            await flowDynamic([
                `✅ Has seleccionado la promoción número ${promoChoice}.`,
                "🎉 Estamos procesando tu pedido.",
            ]);
            return gotoFlow(finalStepFlow);
        }
    );

// Flujo final para confirmar el pedido
const finalStepFlow = addKeyword(['finalizar', 'confirmar'])
    .addAnswer(
        `✅ ¡Gracias por tu pedido! Por favor, indícanos tu nombre y número de contacto para finalizar la compra. 📝`,
        { capture: true },
        async (ctx, { flowDynamic }) => {
            await flowDynamic([
                `🎉 ¡Gracias, ${ctx.body.trim()}! Nos pondremos en contacto contigo pronto para coordinar la entrega.`
            ]);
        }
    );

export default memorySelect;
