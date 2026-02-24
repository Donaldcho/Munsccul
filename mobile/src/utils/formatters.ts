export const formatCurrency = (amount: number | string) => {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount
    return new Intl.NumberFormat('en-CM', {
        style: 'currency',
        currency: 'XAF',
        maximumFractionDigits: 0
    }).format(value || 0).replace('AF', '') // Remove AF to have just XAF if needed, or keep it
}

export const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    })
}
