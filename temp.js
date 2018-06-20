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
console.log(food);
