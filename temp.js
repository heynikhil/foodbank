const data = {
    pizza: ['Pizza Margherita', 'peppy paneer'],
    sandwich: [],
    burger: ['Veg Maharaja'],
    number: [0,2]
};

const food = []
for (const key in data) {
    if (data.hasOwnProperty(key)) {
        const element = data[key];
        element.forEach(el => {
            food.push(el)
        });
    }
}
const result = [].concat(...Object.values(data)).filter(isNaN);
const d = [{
    name: 'de',
    parameters:
    {
        'burger.original': '',
        pizza: [],
        burger: [],
        'pizza.original': '',
        sandwich: [Array],
        'sandwich.original': 'Schezwan Sandwich'
    },
    lifespan: 5
},
    {
        name: 'delivery-add',
        parameters:
        {
            number: [],
            'burger.original': '',
            pizza: [],
            burger: [],
            'pizza.original': '',
            sandwich: [Array],
            'number.original': '',
            'sandwich.original': 'Schezwan Sandwich'
        },
        lifespan: 2
    }]